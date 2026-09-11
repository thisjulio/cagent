export type Op = "update" | "add" | "delete";

export interface Hunk {
  oldLines: string[];
  newLines: string[];
}

export interface PatchFile {
  path: string;
  op: Op;
  hunks: Hunk[];
}

// formato Codex apply_patch: *** Begin Patch / *** {Update|Add|Delete} File: <caminho> / @@ hunks / linhas +,-,contexto
const BEGIN_RE = /\*\*\* Begin patch\s*\n/i;

function parsePathLine(line: string): { path: string; op: Op } {
  const m = line.trim().match(/^\*\*\* (Update|Add|Delete) File:\s*(.*)$/);
  return m ? { path: m[2].trim(), op: m[1].toLowerCase() as Op } : { path: line.trim(), op: "update" };
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
    else {
      const ctx = line === " " ? "" : line.slice(1);
      cur.oldLines.push(ctx);
      cur.newLines.push(ctx);
    }
  }
  return hunks;
}

function addHunks(lines: string[]): Hunk[] {
  const newLines = lines.map((l) => (l.startsWith("+") ? l.slice(1) : l === " " ? "" : l));
  return [{ oldLines: [], newLines }];
}

export function parseApplyPatch(patch: string): PatchFile[] {
  const files: PatchFile[] = [];
  const parts = patch.split(BEGIN_RE).slice(1);
  for (const part of parts) {
    const body = part.split(/\*\*\* End patch/i)[0];
    const lines = body.split("\n");
    if (lines[lines.length - 1] === "") lines.pop(); // artefato do \n final, não linha do hunk
    const fileIdx = lines.findIndex((l) => !l.startsWith("@@") && l.trim().length > 0);
    if (fileIdx < 0) throw new Error("patch sem caminho de arquivo");
    const { path, op } = parsePathLine(lines[fileIdx]);
    files.push({ path, op, hunks: op === "add" ? addHunks(lines.slice(fileIdx + 1)) : op === "delete" ? [] : updateHunks(lines.slice(fileIdx + 1)) });
  }
  if (!files.length) throw new Error("nenhum bloco *** Begin patch encontrado");
  return files;
}
