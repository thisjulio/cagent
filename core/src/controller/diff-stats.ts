export type DiffStats = { added: number; removed: number };

// ponytail: diff text is re-scanned on every UI render while streaming, so
// cache by display object identity (chat items keep the same reference).
const cache = new WeakMap<object, DiffStats>();

export function diffStats(diff: string): DiffStats {
  const stats = { added: 0, removed: 0 };
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) stats.added++;
    if (line.startsWith("-")) stats.removed++;
  }
  return stats;
}

export function cachedDiffStats(
  display: { content: string } | undefined,
): DiffStats {
  if (!display) return { added: 0, removed: 0 };
  const hit = cache.get(display);
  if (hit) return hit;
  const stats = diffStats(display.content);
  cache.set(display, stats);
  return stats;
}
