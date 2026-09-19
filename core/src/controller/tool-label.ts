export function toolCommandLabel(
  tool: string,
  args: Record<string, unknown>,
): string {
  if (typeof args.command === "string") return args.command;
  if (typeof args.path === "string") return args.path;
  if (typeof args.pattern === "string") return args.pattern;
  if (typeof args.target === "string") return args.target;
  if (typeof args.name === "string") return args.name;
  if (tool === "write_file" && typeof args.content === "string")
    return "file content";
  return tool;
}
