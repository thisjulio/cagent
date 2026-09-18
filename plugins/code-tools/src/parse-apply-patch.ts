export type Op = "update" | "add" | "delete";

export interface Hunk {
  oldLines: string[];
  newLines: string[];
}

function parseFile(path: string, op: Op, lines: string[]): PatchFile {
  let movePath: string | undefined;
  const moveIndex = lines.findIndex((line) =>
    /^\*\*\* Move to:\s*/i.test(line.trim()),
  );
  if (moveIndex >= 0) {
    movePath = lines[moveIndex].replace(/^\s*\*\*\* Move to:\s*/i, "").trim();
    if (!movePath) throw new Error("move destination is empty");
    lines = lines.slice(0, moveIndex).concat(lines.slice(moveIndex + 1));
  }
  return {
    path,
    op,
    hunks:
      op === "add"
        ? addHunks(lines)
        : op === "delete"
          ? []
          : updateHunks(lines),
    ...(movePath ? { movePath } : {}),
  };
}

export interface PatchFile {
  path: string;
  op: Op;
  hunks: Hunk[];
  movePath?: string;
}

// Codex apply_patch format: *** Begin Patch / *** {Update|Add|Delete} File: <path> / @@ hunks / +,-,context lines.
const BEGIN_RE = /\*\*\* Begin patch\s*\n/i;

function parsePathLine(line: string): { path: string; op: Op } {
  const m = line.trim().match(/^\*\*\* (Update|Add|Delete) File:\s*(.*)$/);
  return m
    ? { path: m[2].trim(), op: m[1].toLowerCase() as Op }
    : { path: line.trim(), op: "update" };
}

function updateHunks(lines: string[]): Hunk[] {
  const hunks: Hunk[] = [];
  let cur: Hunk | null = null;
  for (const line of lines) {
    if (line.startsWith("@@")) {
      cur = { oldLines: [], newLines: [] };
      hunks.push(cur);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith("+")) cur.newLines.push(line.slice(1));
    else if (line.startsWith("-")) cur.oldLines.push(line.slice(1));
    else if (line.startsWith(" ")) {
      const ctx = line.slice(1);
      cur.oldLines.push(ctx);
      cur.newLines.push(ctx);
    } else throw new Error(`invalid patch line: ${line}`);
  }
  return hunks;
}

function addHunks(lines: string[]): Hunk[] {
  const newLines = lines.map((l) =>
    l.startsWith("+") ? l.slice(1) : l === " " ? "" : l,
  );
  return [{ oldLines: [], newLines }];
}

export function parseApplyPatch(patch: string): PatchFile[] {
  const files: PatchFile[] = [];
  const parts = patch.split(BEGIN_RE).slice(1);
  for (const part of parts) {
    const body = part.split(/\*\*\* End patch/i)[0];
    const lines = body.split("\n");
    if (lines[lines.length - 1] === "") lines.pop(); // Final newline artifact, not a hunk line.
    const fileIndexes = lines
      .map((line, index) =>
        /^\*\*\* (Update|Add|Delete) File:/.test(line.trim()) ? index : -1,
      )
      .filter((index) => index >= 0);
    if (!fileIndexes.length) {
      const fileIdx = lines.findIndex(
        (line) => !line.startsWith("@@") && line.trim().length > 0,
      );
      if (fileIdx < 0) throw new Error("patch has no file path");
      const { path, op } = parsePathLine(lines[fileIdx]);
      files.push(parseFile(path, op, lines.slice(fileIdx + 1)));
      continue;
    }
    for (let i = 0; i < fileIndexes.length; i++) {
      const fileIdx = fileIndexes[i];
      const end = fileIndexes[i + 1] ?? lines.length;
      const { path, op } = parsePathLine(lines[fileIdx]);
      files.push(parseFile(path, op, lines.slice(fileIdx + 1, end)));
    }
  }
  if (!files.length) throw new Error("no *** Begin patch block found");
  return files;
}
