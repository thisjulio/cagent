import type { ToolCategory } from "./tool-category";

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

export function fallbackToolTitle(
  tool: string,
  category: ToolCategory,
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
  if (category === "search")
    return `Search "${String(args.pattern ?? "")}"`.slice(0, 24);
  if (category === "shell") {
    const command = String(args.command ?? args.cmd ?? "").trim();
    return command ? `Run ${command.split(/\s+/)[0]}` : tool;
  }
  return tool;
}

export function ensureToolTitle(
  value: unknown,
  tool: string,
  categoryOrArgs?: ToolCategory | Record<string, unknown>,
  toolArgs: Record<string, unknown> = {},
): string {
  const category =
    typeof categoryOrArgs === "string" ? categoryOrArgs : undefined;
  const args =
    categoryOrArgs && typeof categoryOrArgs === "object"
      ? categoryOrArgs
      : toolArgs;
  if (tool === "skill" && typeof args.name === "string")
    return `skill ${args.name}`;
  return (
    normalizeToolTitle(value) ??
    fallbackToolTitle(tool, category ?? inferCategory(tool), args)
  );
}

function inferCategory(tool: string): ToolCategory {
  if (tool === "write_file" || tool === "edit_file") return "write";
  if (tool === "read_file") return "read";
  if (tool === "search" || tool === "search_ast" || tool === "list_files")
    return "search";
  if (tool === "bash") return "shell";
  return "generic";
}
