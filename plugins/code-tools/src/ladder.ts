export interface Match {
  start: number;
  count: number;
  score: number;
  mode: "exact" | "normalized" | "fuzzy";
}

export type FindResult = Match | "ambiguous" | null;

export function normalize(s: string): string {
  return s.replace(/[ \t]+/g, " ").trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = cur;
  }
  return prev[b.length];
}

// ponytail: janela fuzzy é O(n·L·M); suficiente para arquivos de código, degenera em arquivos gigantes
export function findBlock(lines: string[], search: string, threshold: number): FindResult {
  const sLines = search.split("\n");
  if (!sLines.length) return null;
  const n = lines.length;
  for (let i = 0; i + sLines.length <= n; i++) {
    if (sLines.every((l, j) => lines[i + j] === l)) return { start: i, count: sLines.length, score: 1, mode: "exact" };
  }
  const nLines = lines.map(normalize);
  const ns = sLines.map(normalize);
  for (let i = 0; i + ns.length <= n; i++) {
    if (ns.every((l, j) => nLines[i + j] === l)) return { start: i, count: ns.length, score: 1, mode: "normalized" };
  }
  const target = ns.join("\n");
  let best: Match | null = null;
  let ties = 0;
  for (let i = 0; i + ns.length <= n; i++) {
    const w = nLines.slice(i, i + ns.length).join("\n");
    const d = levenshtein(target, w);
    const score = 1 - d / Math.max(target.length, w.length);
    if (score < threshold) continue;
    if (!best || score > best.score) {
      best = { start: i, count: ns.length, score, mode: "fuzzy" };
      ties = 1;
    } else if (score === best.score) {
      ties++;
    }
  }
  if (best && ties > 1) return "ambiguous";
  return best;
}
