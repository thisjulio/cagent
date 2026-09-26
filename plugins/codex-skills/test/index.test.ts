import { describe, expect, it } from "bun:test";
import os from "node:os";
import path from "node:path";
import type { PluginContext, SkillSource } from "@cagent/sdk";
import register from "../src/index";

describe("Codex skill source", () => {
  it("registers project and user skill roots", () => {
    let registered: SkillSource | undefined;
    const context = {
      registerSkillSource(source: SkillSource) {
        registered = source;
      },
    } as PluginContext;

    register(context);

    expect(registered?.discover("/workspace")).toEqual([
      path.join("/workspace", ".codex/skills"),
      path.join(os.homedir(), ".codex/skills"),
    ]);
  });
});
