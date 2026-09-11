export interface Region {
  search: string;
  replace: string | null;
}

const BLOCK_RE = /<<<\s*SEARCH\s*\n([\s\S]*?)\n\s*>>>(?:\s*<<<\s*REPLACE\s*\n([\s\S]*?)\n\s*>>>)?/g;

export function parseSearchReplace(blocks: string): Region[] {
  const regions: Region[] = [];
  for (const m of blocks.matchAll(BLOCK_RE)) {
    regions.push({ search: m[1], replace: m[2] ?? null });
  }
  if (!regions.length) throw new Error("nenhum bloco << SEARCH >> encontrado");
  return regions;
}
