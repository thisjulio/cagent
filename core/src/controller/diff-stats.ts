export type DiffStats = { added: number; removed: number };

export function diffStats(diff: string): DiffStats {
  const stats = { added: 0, removed: 0 };
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) stats.added++;
    if (line.startsWith("-")) stats.removed++;
  }
  return stats;
}
