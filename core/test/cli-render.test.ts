import { describe, expect, test } from "bun:test";
import { renderHumanHistory } from "../src/cli-render";

describe("human CLI history renderer", () => {
  test("uses interactive history roles and formatting", () => {
    const output = renderHumanHistory([
      { kind: "user", content: "task" },
      { kind: "thinking", content: "reasoning" },
      { kind: "assistant", content: "final" },
      { kind: "tool", toolName: "bash", cmd: "git status", content: "clean" },
    ], false);
    expect(output).toContain("You\n└─ task");
    expect(output).toContain("cagent\n├─ thinking\n│  reasoning");
    expect(output).toContain("└─ final\n├─ ⏺ bash · git status\n│  clean");
    expect(output).toContain("├─ ⏺ bash · git status\n│  clean");
  });

  test("renders thinking with a bold heading and tree connector", () => {
    const output = renderHumanHistory([{ kind: "thinking", content: "private reasoning" }], true);
    expect(output).toBe(
      "cagent\n├─ \u001b[1mthinking\u001b[0m\n\u001b[3;90m│  private reasoning\u001b[0m",
    );
  });
});
