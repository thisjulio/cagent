import { describe, expect, test } from "bun:test";
import { requestDiagnostics } from "../src/request-diagnostics";

describe("Anthropic request diagnostics", () => {
  test("records role and block structure without IDs or message text", () => {
    const diagnostics = requestDiagnostics([
      {
        role: "assistant",
        content: [
          { type: "text", text: "private assistant output" },
          { type: "tool_use", id: "secret-tool-call-id", text: "" },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "secret-tool-call-id",
            text: "private tool output",
          },
        ],
      },
    ]);

    expect(diagnostics).toMatchObject({
      "anthropic.request.role_sequence": "assistant,user",
      "anthropic.request.tool_use_count": 1,
      "anthropic.request.tool_result_count": 1,
      "anthropic.request.orphan_tool_result_count": 0,
      "anthropic.request.tool_use_without_result_count": 0,
      "anthropic.request.has_tool_pairing_issue": false,
    });
    expect(JSON.stringify(diagnostics)).not.toContain("private");
    expect(JSON.stringify(diagnostics)).not.toContain("secret-tool-call-id");
  });

  test("detects orphan results and tool uses without results", () => {
    const diagnostics = requestDiagnostics([
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "unanswered" }],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "orphan" }],
      },
    ]);

    expect(diagnostics).toMatchObject({
      "anthropic.request.orphan_tool_result_count": 1,
      "anthropic.request.tool_use_without_result_count": 1,
      "anthropic.request.has_tool_pairing_issue": true,
    });
  });
});
