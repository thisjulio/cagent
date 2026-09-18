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
  const routes: string[] = [];
  for (const e of entries)
    for (const m of e.models) routes.push(`${e.route}/${m}`);
  return fuzzy(routes, query);
}
