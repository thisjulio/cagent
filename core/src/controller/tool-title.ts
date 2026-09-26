const MAX_TOOL_TITLE_LENGTH = 80;

export function normalizeToolTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const title = value
    .replace(
      /[\u001b\u009b][[\\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)?)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[ inBTRfK]))/g,
      "",
    )
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TOOL_TITLE_LENGTH);
  return title || undefined;
}

export function fallbackToolTitle(
  tool: string,
  category: string,
  args: Record<string, unknown> = {},
): string {
  const path = String(
    args.path ?? args.file_path ?? args.file ?? args.target ?? "",
  );
  const basename = path.split(/[\\/]/).filter(Boolean).at(-1);
  if (category === "write") {
    if (!basename) return tool;
    return tool === "write_file" ? `Write ${basename}` : `Edit ${basename}`;
  }
  if (category === "read")
    return basename ? `Read ${basename}` : `Read ${tool}`;
  if (category === "search") {
    const pattern = String(args.pattern ?? "");
    return `Search "${pattern}"`.slice(0, 24);
  }
  if (category === "shell") {
    const command = String(args.command ?? args.cmd ?? "").trim();
    return command ? `Run ${command.split(/\s+/)[0]}` : tool;
  }
  return tool;
}

export function ensureToolTitle(
  value: unknown,
  tool: string,
  category = "generic",
  args: Record<string, unknown> = {},
): string {
  return normalizeToolTitle(value) ?? fallbackToolTitle(tool, category, args);
}
