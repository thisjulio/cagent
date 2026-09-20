const MAX_TOOL_TITLE_LENGTH = 80;

export function normalizeToolTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const title = value
    .replace(
      /[\u001b\u009b][[\\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[ inBTRfK]))/g,
      "",
    )
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TOOL_TITLE_LENGTH);
  return title || undefined;
}

export function ensureToolTitle(value: unknown, tool: string): string {
  return normalizeToolTitle(value) ?? `Executing ${tool}`;
}
