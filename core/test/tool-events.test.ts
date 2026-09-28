import { describe, expect, it } from "bun:test";
import { toolPost, toolPre } from "../src/controller/tool-events";
import type { UIState } from "../src/controller/state";

describe("tool preparation status", () => {
  it("turns the preparing row into the running tool row", () => {
    const prepared = {
      kind: "tool" as const,
      content: "",
      toolName: "edit_file",
      toolCallId: "call-1",
      turnId: "turn-1",
      title: "preparing edit",
      toolCategory: "write" as const,
      preparing: true,
      running: true,
    };
    const state = {
      chat: [prepared],
      chatVersion: 0,
      toolLog: [],
      currentTurnId: "turn-1",
    } as unknown as UIState;

    toolPre(state, {
      tool: "edit_file",
      args: { path: "src/file.ts" },
      title: "Edit src/file.ts",
    });

    expect(state.chat).toHaveLength(1);
    expect(state.chat[0]).toBe(prepared);
    expect(state.chat[0]).toMatchObject({
      title: "Edit src/file.ts",
      cmd: "src/file.ts",
      preparing: false,
      running: true,
      turnId: "turn-1",
    });
    expect(state.chat[0]?.toolCallId).toBeUndefined();
  });

  it("does not attach one result to a later same-name preparation", () => {
    const state = {
      chat: ["first", "second"].map((id) => ({
        kind: "tool" as const,
        content: "",
        toolName: "edit_file",
        toolCallId: id,
        title: "preparing edit",
        toolCategory: "write" as const,
        preparing: true,
        running: true,
      })),
      chatVersion: 0,
      toolLog: [],
    } as unknown as UIState;

    toolPre(state, { tool: "edit_file", args: { path: "one.ts" } });
    toolPost(state, {
      tool: "edit_file",
      result: { output: "done", args: { path: "one.ts" } },
    });

    expect(state.chat[0]).toMatchObject({ running: false, cmd: "one.ts" });
    expect(state.chat[1]).toMatchObject({ preparing: true, running: true });
  });

  it("replaces capped live output with the complete final tool result", () => {
    const streamed = {
      kind: "tool" as const,
      content: "partial live output … truncated",
      toolName: "bash",
      running: true,
      startedAt: Date.now(),
    };
    const state = {
      chat: [streamed],
      chatVersion: 0,
      toolLog: [],
    } as unknown as UIState;

    toolPost(state, {
      tool: "bash",
      result: { output: "complete final output\nlast line" },
    });

    expect(streamed.content).toBe("complete final output\nlast line");
    expect(streamed.running).toBe(false);
  });
});
