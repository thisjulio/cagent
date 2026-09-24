function patchFilePath(patch: string): string | undefined {
  const match = patch.match(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/m);
  return match?.[1]?.trim() || undefined;
}

export function toolCommandLabel(
  tool: string,
  args: Record<string, unknown>,
): string {
  if (typeof args.command === "string") return args.command;
  if (typeof args.path === "string") return args.path;
  if (tool === "edit_file" && typeof args.patch === "string") {
    const path = patchFilePath(args.patch);
    if (path) return path;
  }
  if (typeof args.pattern === "string") return args.pattern;
  if (typeof args.target === "string") return args.target;
  if (typeof args.name === "string") return args.name;
  if (tool === "write_file" && typeof args.content === "string")
    return "file content";
  return tool;
}
