import path from "node:path";
import type { FileSymbols } from "./symbols";

function importedFiles(file: FileSymbols, known: Set<string>): Set<string> {
  const resolved = new Set<string>();
  for (const specifier of file.imports) {
    if (!specifier.startsWith(".")) continue;
    const base = path.posix.normalize(
      path.posix.join(path.posix.dirname(file.file), specifier),
    );
    const stem = base.replace(/\.(js|jsx|mjs|cjs)$/, "");
    const candidates = [
      base,
      ...[".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"].flatMap(
        (ext) => [stem + ext, `${base}/index${ext}`],
      ),
    ];
    const target = candidates.find((candidate) => known.has(candidate));
    if (target && target !== file.file) resolved.add(target);
  }
  return resolved;
}

function edges(files: FileSymbols[]): Map<string, number>[] {
  const owners = new Map<string, Set<string>>();
  const known = new Set(files.map((file) => file.file));
  for (const file of files)
    for (const def of file.definitions) {
      const targets = owners.get(def.name) ?? new Set<string>();
      targets.add(file.file);
      owners.set(def.name, targets);
    }
  return files.map((file) => {
    const links = new Map<string, number>();
    const imports = importedFiles(file, known);
    for (const target of imports) links.set(target, 1);
    for (const name of file.references) {
      const targets = owners.get(name);
      if (!targets) continue;
      const direct = [...targets].filter((target) => imports.has(target));
      // ponytail: name matching is heuristic; use semantic resolution if ambiguity harms ranking.
      const selected = direct.length
        ? direct
        : targets.size === 1
          ? [...targets]
          : [];
      const weight = Math.log(1 + files.length / targets.size);
      for (const target of selected)
        if (target !== file.file)
          links.set(target, (links.get(target) ?? 0) + weight);
    }
    return links;
  });
}

export function rank(files: FileSymbols[]): FileSymbols[] {
  if (!files.length) return [];
  const links = edges(files);
  const positions = new Map(files.map((file, index) => [file.file, index]));
  let scores = files.map(() => 1 / files.length);
  for (let iteration = 0; iteration < 30; iteration++) {
    const dangling = scores.reduce(
      (sum, score, index) => sum + (links[index].size ? 0 : score),
      0,
    );
    const next = files.map(() => (0.15 + 0.85 * dangling) / files.length);
    for (let index = 0; index < files.length; index++) {
      const total = [...links[index].values()].reduce(
        (sum, weight) => sum + weight,
        0,
      );
      for (const [target, weight] of links[index])
        next[positions.get(target)!] += (0.85 * scores[index] * weight) / total;
    }
    scores = next;
  }
  return files
    .map((file, index) => ({ file, score: scores[index] }))
    .sort((a, b) => b.score - a.score || a.file.file.localeCompare(b.file.file))
    .map(({ file }) => file);
}

export function render(files: FileSymbols[], tokens: number): string {
  const limit = Math.max(0, Math.floor(tokens)) * 4;
  let output =
    "Repository map — selected declarations, not implementations. Read source before editing; line numbers may change.\n";
  if (output.length > limit) return "";
  const popularity = new Map<string, number>();
  for (const file of files)
    for (const name of new Set(file.references))
      popularity.set(name, (popularity.get(name) ?? 0) + 1);
  for (const file of files) {
    const definitions = [...file.definitions].sort(
      (a, b) =>
        (popularity.get(b.name) ?? 0) - (popularity.get(a.name) ?? 0) ||
        a.line - b.line,
    );
    let section = "";
    for (const def of definitions.slice(0, 8)) {
      const entry = `  L${def.line} ${def.signature}\n`;
      const prefix = section ? "" : `\n${JSON.stringify(file.file)}:\n`;
      if (
        output.length + section.length + prefix.length + entry.length <=
        limit
      )
        section += prefix + entry;
    }
    output += section;
  }
  return output.includes("\n  L") ? output : "";
}
