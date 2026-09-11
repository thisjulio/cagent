export const MAX_VISIBLE_STREAM_CHARS = 64 * 1024;
export const MAX_TOOL_OUTPUT_CHARS = 128 * 1024;
export const MAX_RESPONSE_CHARS = 1024 * 1024;
const TRUNCATED = "\n[conteudo truncado para preservar memoria]";

export function appendCapped(current: string, chunk: string, max: number): string {
  if (!chunk) return current;
  const next = current + chunk;
  if (next.length <= max) return next;
  if (max <= TRUNCATED.length) return next.slice(-max);
  return TRUNCATED + next.slice(-(max - TRUNCATED.length));
}
