import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { root } from "./state";

function git(args: string[], shadow = true, input?: string): string {
  const cwd = root();
  const prefix = shadow
    ? [
        "--git-dir",
        path.join(cwd, ".cagent", ".shadow", "git"),
        "--work-tree",
        cwd,
        "-c",
        "core.bare=false",
      ]
    : [];
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("GIT_")) delete env[key];
  const result = spawnSync("git", [...prefix, ...args], {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    input,
  });
  if (result.status !== 0)
    throw new Error(result.stderr || "Shadow Git failed");
  return result.stdout.replace(/\n$/, "");
}

export function ensureShadow(): void {
  let exclude: string | undefined;
  let prefix = "";
  try {
    exclude = path.resolve(
      root(),
      git(["rev-parse", "--git-path", "info/exclude"], false),
    );
    prefix = git(["rev-parse", "--show-prefix"], false);
  } catch {
    // Non-Git workspaces have no parent repository to protect.
  }
  if (exclude) {
    const rule = `/${prefix}.cagent/.shadow/`;
    const existing = fs.existsSync(exclude)
      ? fs.readFileSync(exclude, "utf8")
      : "";
    if (!existing.split(/\r?\n/).includes(rule)) {
      fs.mkdirSync(path.dirname(exclude), { recursive: true });
      fs.appendFileSync(
        exclude,
        `${existing && !existing.endsWith("\n") ? "\n" : ""}${rule}\n`,
      );
    }
  }
  const dir = path.join(root(), ".cagent", ".shadow", "git");
  if (fs.existsSync(path.join(dir, "HEAD"))) return;
  fs.mkdirSync(dir, { recursive: true });
  git(["init", "--bare", dir], false);
}

function eligibleFiles(): string[] {
  // Use the user's repository only to consult ignore rules, never its index for writes.
  const files: string[] = [];
  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(root(), dir), {
      withFileTypes: true,
    })) {
      const name = path.posix.join(dir, entry.name);
      if ([".git", ".cagent", "node_modules"].includes(entry.name)) continue;
      if (
        /^(\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\..*)?|secrets?(?:\..*)?)$/i.test(
          entry.name,
        )
      )
        continue;
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile()) files.push(name);
    }
  };
  visit("");
  const isRepository =
    spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root() })
      .status === 0;
  const ignoreArgs = isRepository
    ? []
    : [
        "--git-dir",
        path.join(root(), ".cagent", ".shadow", "git"),
        "--work-tree",
        root(),
        "-c",
        "core.bare=false",
      ];
  const ignored = spawnSync(
    "git",
    [...ignoreArgs, "check-ignore", "--no-index", "--stdin", "-z"],
    {
      cwd: root(),
      input: files.join("\0") + "\0",
      encoding: "utf8",
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
      ),
    },
  );
  const excluded = new Set(ignored.stdout?.split("\0") ?? []);
  return files.filter((file) => !excluded.has(file));
}

export function shadowCommit(label: string): string {
  ensureShadow();
  git(["read-tree", "--empty"]);
  const files = eligibleFiles();
  const blobs = files.length
    ? git(
        ["hash-object", "-w", "--no-filters", "--stdin-paths"],
        true,
        files.map(quoteGitPath).join("\n") + "\n",
      ).split("\n")
    : [];
  const entries = files.map((file, index) => {
    const mode =
      fs.statSync(path.join(root(), file)).mode & 0o111 ? "100755" : "100644";
    return `${mode} ${blobs[index]}\t${file}\0`;
  });
  if (entries.length)
    git(["update-index", "-z", "--index-info"], true, entries.join(""));
  git([
    "-c",
    "user.name=cagent",
    "-c",
    "user.email=cagent@localhost",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "--allow-empty",
    "--no-gpg-sign",
    "-m",
    label,
  ]);
  return git(["rev-parse", "HEAD"]);
}

function quoteGitPath(file: string): string {
  const escaped = file.replace(/[\x00-\x1f"\\]/g, (character) => {
    if (character === '"' || character === "\\") return `\\${character}`;
    return `\\${character.charCodeAt(0).toString(8).padStart(3, "0")}`;
  });
  return `"${escaped}"`;
}

type Entry = { hash: string; mode: number; data: Buffer };
function tree(hash: string): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  for (const entry of git(["ls-tree", "-r", "-z", hash])
    .split("\0")
    .filter(Boolean)) {
    const tab = entry.indexOf("\t");
    const [mode, , blob] = entry.slice(0, tab).split(" ");
    const file = entry.slice(tab + 1);
    if (!["100644", "100755"].includes(mode))
      throw new Error("Unsupported checkpoint entry");
    const result = spawnSync(
      "git",
      [
        "--git-dir",
        path.join(root(), ".cagent", ".shadow", "git"),
        "cat-file",
        "blob",
        blob,
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    if (result.status !== 0) throw new Error("Cannot read checkpoint blob");
    entries.set(file, {
      hash: blob,
      mode: mode === "100755" ? 0o755 : 0o644,
      data: result.stdout,
    });
  }
  return entries;
}

function same(a?: Entry, b?: Entry): boolean {
  return a?.hash === b?.hash && a?.mode === b?.mode;
}

export function restoreShadow(
  before: string,
  after: string,
  commit: () => void = () => {},
): void {
  const target = tree(before);
  const expected = tree(after);
  const changed = [...new Set([...target.keys(), ...expected.keys()])].filter(
    (file) => !same(target.get(file), expected.get(file)),
  );
  const backups = new Map<string, { data: Buffer; mode: number }>();
  const directories = new Set<string>();
  for (const file of changed) {
    const abs = path.resolve(root(), file);
    if (
      !abs.startsWith(`${root()}${path.sep}`) ||
      file.split("/").some((part) => part === ".git" || part === ".cagent")
    )
      throw new Error("Unsafe checkpoint path");
    let parent = path.dirname(abs);
    while (parent !== root()) {
      if (fs.existsSync(parent)) {
        const stat = fs.lstatSync(parent);
        if (stat.isSymbolicLink()) throw new Error(`Unsafe symlink: ${file}`);
        if (stat.isDirectory()) directories.add(parent);
        else if (!changed.includes(path.relative(root(), parent)))
          throw new Error(`Unsafe parent: ${file}`);
      }
      parent = path.dirname(parent);
    }
    let stat;
    try {
      stat = fs.lstatSync(abs);
    } catch (error) {
      if (
        !["ENOENT", "ENOTDIR"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw error;
    }
    if (stat?.isSymbolicLink()) throw new Error(`Unsafe symlink: ${file}`);
    if (stat && !stat.isFile() && !stat.isDirectory())
      throw new Error(`Unsafe file: ${file}`);
    const wanted = expected.get(file);
    if (stat?.isFile()) {
      const data = fs.readFileSync(abs);
      backups.set(file, { data, mode: stat.mode & 0o777 });
      if (
        !wanted ||
        !data.equals(wanted.data) ||
        Boolean(stat.mode & 0o111) !== Boolean(wanted.mode & 0o111)
      )
        throw new Error(`Unrelated edits would be overwritten: ${file}`);
    } else if (wanted)
      throw new Error(`Unrelated edits would be overwritten: ${file}`);
    if (stat?.isDirectory()) {
      const inspect = (dir: string): void => {
        directories.add(dir);
        for (const name of fs.readdirSync(dir)) {
          const child = path.join(dir, name);
          const childStat = fs.lstatSync(child);
          if (childStat.isDirectory()) inspect(child);
          else if (
            childStat.isSymbolicLink() ||
            !changed.includes(path.relative(root(), child))
          )
            throw new Error(`Unrelated edits would be overwritten: ${file}`);
        }
      };
      inspect(abs);
    }
  }
  const createdDirectories = new Set<string>();
  const removeFiles = (): void => {
    for (const file of [...changed].sort((a, b) => b.length - a.length)) {
      const abs = path.join(root(), file);
      try {
        if (fs.lstatSync(abs).isFile()) fs.unlinkSync(abs);
      } catch (error) {
        if (
          !["ENOENT", "ENOTDIR"].includes(
            (error as NodeJS.ErrnoException).code ?? "",
          )
        )
          throw error;
      }
    }
    for (const dir of [
      ...new Set([...directories, ...createdDirectories]),
    ].sort((a, b) => b.length - a.length)) {
      try {
        fs.rmdirSync(dir);
      } catch (error) {
        if (
          !["ENOENT", "ENOTEMPTY", "ENOTDIR"].includes(
            (error as NodeJS.ErrnoException).code ?? "",
          )
        )
          throw error;
      }
    }
  };
  const write = (file: string, data: Buffer, mode: number): void => {
    const abs = path.join(root(), file);
    let parent = path.dirname(abs);
    while (parent !== root() && !fs.existsSync(parent)) {
      createdDirectories.add(parent);
      parent = path.dirname(parent);
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, data, { flag: "wx", mode });
    fs.chmodSync(abs, mode);
  };
  try {
    removeFiles();
    for (const file of changed) {
      const entry = target.get(file);
      if (entry) write(file, entry.data, entry.mode);
    }
    commit();
  } catch (error) {
    try {
      removeFiles();
      for (const dir of [...directories].sort((a, b) => a.length - b.length))
        fs.mkdirSync(dir, { recursive: true });
      for (const [file, backup] of backups)
        write(file, backup.data, backup.mode);
    } catch (rollback) {
      throw new AggregateError(
        [error, rollback],
        "Workspace restoration and rollback failed",
      );
    }
    throw error;
  }
}
