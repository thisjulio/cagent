export type ToolCategory = "shell" | "read" | "write" | "search" | "skill" | "agent" | "mcp" | "generic";

export function classifyTool(toolName: string): ToolCategory {
  const name = toolName.toLowerCase();
  if (name.startsWith("mcp-") || name.includes("mcp")) return "mcp";
  if (name === "bash" || name.includes("shell") || name.includes("terminal")) return "shell";
  if (name === "cat" || name.startsWith("read_") || name.includes("read")) return "read";
  if (name === "apply_patch" || name.includes("write") || name.includes("edit") || name.includes("patch")) return "write";
  if (
    name === "list_files" ||
    name === "search" ||
    name === "search_ast" ||
    name.includes("grep") ||
    name.includes("glob") ||
    name.includes("search")
  ) return "search";
  if (name === "skill" || name.startsWith("skill")) return "skill";
  if (name === "agent" || name === "subagent" || name.includes("task")) return "agent";
  if (name.includes("__")) return "mcp";
  return "generic";
}

export function categoryLabel(category: ToolCategory): string {
  return category === "shell" ? "bash" : category;
}