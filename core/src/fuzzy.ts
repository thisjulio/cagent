export function fuzzy(models: string[], q: string): string[] {
  if (!q) return models;
  const n = q.toLowerCase();
  return models.filter((m) => {
    const s = m.toLowerCase();
    let i = 0;
    for (const c of s) if (c === n[i]) i++;
    return i === n.length;
  });
}

export function filterModels(
  entries: { route: string; models: string[] }[],
  query: string,
): string[] {
  const routes = entries.flatMap((entry) =>
    entry.models.map((model) => `${entry.route}/${model}`),
  );
  return fuzzy(routes, query);
}
