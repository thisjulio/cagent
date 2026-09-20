const SENSITIVE_ARGUMENT =
  /(token|password|passwd|secret|api[_-]?key|authorization|cookie)/i;
const MAX_PREVIEW_LENGTH = 160;

export function redactCommand(command: string): string {
  return command
    .replace(
      /(--?(?:token|password|passwd|secret|api[-_]?key|authorization)(?:=|\s+))([^\s]+)/gi,
      "$1[redacted]",
    )
    .slice(0, MAX_PREVIEW_LENGTH);
}

export function toolPreview(
  tool: string,
  args: Record<string, unknown>,
): string | undefined {
  if (tool !== "bash") return undefined;
  if (typeof args.command !== "string") return undefined;
  return redactCommand(args.command);
}

export function safeArgumentSummary(
  args: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      SENSITIVE_ARGUMENT.test(key) ? "[redacted]" : value,
    ]),
  );
}
