const HEADER_PREFIX = "cagent | ";
const MIN_TITLE_CHARS = 12;

export function formatHeaderTitle(title: string, width: number): string {
  if (!title) return "cagent";
  const available = Math.max(MIN_TITLE_CHARS, width - 4);
  const full = `${HEADER_PREFIX}${title}`;
  if (full.length <= available) return full;
  const titleWidth = Math.max(1, available - HEADER_PREFIX.length - 1);
  return `${HEADER_PREFIX}${title.slice(0, titleWidth).trimEnd()}…`;
}