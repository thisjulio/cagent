export interface Hunk {
  oldLines: string[];
  newLines: string[];
}

export interface PatchFile {
  path: string;
  hunks: Hunk[];
}

// formato Codex: *** Begin patch / <caminho> / @@ hunks / linhas +,-,contexto
const BEGIN_RE = /\*\*\* Begin patch\s*\n/;

export function parseApplyPatch(patch: string): PatchFile[] {
  const files: PatchFile[] = [];
  const parts = patch.split(BEGIN_RE).slice(1);
  for (const part of parts) {
    const body = part.split(/\*\*\* End patch/)[0];
    const lines = body.split("\n");
    if (lines[lines.length - 1] === "") lines.pop(); // artefato do \n final, não linha do hunk
    const fileIdx = lines.findIndex((l) => !l.startsWith("@@") && l.trim().length > 0);
    if (fileIdx < 0) throw new Error("patch sem caminho de arquivo");
    const hunks: Hunk[] = [];
    let cur: Hunk | null = null;
    for (const line of lines.slice(fileIdx + 1)) {
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
    files.push({ path: lines[fileIdx].trim(), hunks });
  }
  if (!files.length) throw new Error("nenhum bloco *** Begin patch encontrado");
  return files;
}
