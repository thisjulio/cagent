import { describe, expect, it } from "bun:test";
import { classifyTool } from "../src/tool-category";

describe("classifyTool", () => {
  it("classifies the built-in coding tools", () => {
    expect(classifyTool("bash")).toBe("shell");
    expect(classifyTool("read_file")).toBe("read");
    expect(classifyTool("write_file")).toBe("write");
    expect(classifyTool("edit_file")).toBe("write");
    expect(classifyTool("apply_patch")).toBe("write");
    expect(classifyTool("replace_lines")).toBe("write");
    expect(classifyTool("search")).toBe("search");
    expect(classifyTool("search_ast")).toBe("search");
    expect(classifyTool("list_files")).toBe("search");
    expect(classifyTool("memory_search")).toBe("search");
  });

  it("keeps specialized tools in their own categories", () => {
    expect(classifyTool("skill")).toBe("skill");
    expect(classifyTool("cagent-development")).toBe("generic");
    expect(classifyTool("subagent")).toBe("agent");
    expect(classifyTool("mcp-filesystem-read_file")).toBe("read");
  });

  it("uses generic only for genuinely unknown tools", () => {
    expect(classifyTool("weather_lookup")).toBe("generic");
  });
});
