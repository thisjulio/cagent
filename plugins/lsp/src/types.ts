export type LspPosition = { line: number; character: number };
export type LspRange = { start: LspPosition; end: LspPosition };
export type LspDiagnostic = {
  range: LspRange;
  severity?: number;
  message: string;
  source?: string;
};
export type LspServerConfig = {
  command: string[];
  extensions: string[];
  initialization?: Record<string, unknown>;
};
