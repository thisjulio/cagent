export type PluginStorage = {
  namespace: string;
  path: (...segments: string[]) => string;
};

export type DiagnosticLevel = "info" | "warn" | "error";
export type Diagnostic = {
  level: DiagnosticLevel;
  code: string;
  message: string;
  attributes?: Readonly<Record<string, string | number | boolean>>;
};

export type PluginDiagnostics = {
  report(diagnostic: Diagnostic): void;
};
