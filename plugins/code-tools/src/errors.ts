export type ErrorCode =
  | "E_PATH"
  | "E_NOT_FOUND"
  | "E_EXISTS"
  | "E_STALE"
  | "E_NO_MATCH"
  | "E_AMBIGUOUS"
  | "E_PARSE"
  | "E_REPEATED_FAILURE"
  | "E_WRITE"
  | "E_SEARCH"
  | "E_RANGE"
  | "E_EXPECTED"
  | "E_LANG";

// Convention: the first line is always `ERROR <CODE> - <detail>` (detail starts with the path).
export function errorText(code: ErrorCode, detail: string): string {
  return `ERROR ${code} - ${detail}`;
}
