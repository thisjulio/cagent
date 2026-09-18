import { describe, expect, it } from "bun:test";
import { HookRegistry } from "../src/hooks";

describe("HookRegistry", () => {
  it("runs hooks for their phase and preserves responses", async () => {
    const registry = new HookRegistry();
    registry.register({
      name: "guard",
      phase: "before_tool",
      handle: async (event) => ({
        action: "deny",
        reason: `blocked ${event.tool}`,
      }),
    });
    registry.register({
      name: "after",
      phase: "after_tool",
      handle: () => ({ action: "continue" }),
    });
    expect(
      await registry.run({ phase: "before_tool", tool: "bash", args: {} }),
    ).toEqual([{ action: "deny", reason: "blocked bash" }]);
  });

  it("rejects duplicate hook names", () => {
    const registry = new HookRegistry();
    const hook = {
      name: "same",
      phase: "before_tool" as const,
      handle: () => ({ action: "allow" as const }),
    };
    registry.register(hook);
    expect(() => registry.register(hook)).toThrow("duplicate hook");
  });
});
