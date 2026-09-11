export type ErrorCode =
  | "E_PATH"
  | "E_NOT_FOUND"
  | "E_STALE"
  | "E_NO_MATCH"
  | "E_AMBIGUOUS"
  | "E_PARSE"
  | "E_REPEATED_FAILURE"
  | "E_WRITE"
  | "E_SEARCH";

// convenção: primeira linha é sempre `ERRO <CODE> — <detail>` (o detail começa com o caminho)
export function errorText(code: ErrorCode, detail: string): string {
  return `ERRO ${code} — ${detail}`;
}
