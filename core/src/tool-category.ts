export type ToolCategory = "shell" | "read" | "write" | "search" | "skill" | "agent" | "mcp" | "generic";

export function classifyTool(toolName: string): ToolCategory {
  const name = toolName.toLowerCase();
  if (name.includes("bash") || name.includes("shell") || name.includes("terminal")) return "shell";
  if (name.includes("read") || name === "cat") return "read";
  if (name.includes("write") || name.includes("edit") || name.includes("patch")) return "write";
  if (name.includes("search") || name.includes("grep") || name.includes("glob")) return "search";
  if (name.includes("skill")) return "skill";
  if (name.includes("agent") || name.includes("task")) return "agent";
  if (name.includes("mcp") || name.includes("__")) return "mcp";
  return "generic";
}

export function categoryLabel(category: ToolCategory): string {
  return category === "shell" ? "bash" : category;
}