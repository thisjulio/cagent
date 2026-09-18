import { describe, expect, it } from "bun:test";
import { composeSkill } from "../src/skills/composition";
import { createReadSkillTool } from "../src/skills/read-tool";
import type { SkillCatalog } from "../src/skills/types";
import { applySkillArguments } from "../src/skills/arguments";

function catalog(): SkillCatalog {
  const grilling = {
    metadata: { name: "grilling", description: "Ask design questions." },
    directory: "/tmp/grilling",
    instructionFile: "/tmp/grilling/SKILL.md",
    content: "Ask questions about $ARGUMENTS.",
  };
  const manual = {
    metadata: {
      name: "manual",
      description: "Manual workflow.",
      disableModelInvocation: true,
    },
    directory: "/tmp/manual",
    instructionFile: "/tmp/manual/SKILL.md",
    content: "Manual only.",
  };
  return {
    skills: [grilling, manual],
    byName: new Map([
      ["grilling", grilling],
      ["manual", manual],
    ]),
  };
}

describe("skills", () => {
  it("renders explicit arguments into composed instructions", async () => {
    await expect(
      composeSkill(catalog(), "grilling", { arguments: "clipboard support" }),
    ).resolves.toContain("clipboard support");
  });

  it("expands arguments without composing another skill", () => {
    expect(applySkillArguments("Task: $ARGUMENTS", "clipboard support")).toBe(
      "Task: clipboard support",
    );
  });

  it("does not expose manual-only skills to model invocation", async () => {
    const result = await createReadSkillTool(catalog()).execute({
      name: "manual",
    });
    expect(result).toEqual({
      output: "skill is user-invocable only: manual",
      isError: true,
    });
  });

  it("returns the full skill payload in the native tool envelope", async () => {
    const result = await createReadSkillTool(catalog()).execute({
      name: "grilling",
    });
    expect(result.output).toContain('<skill_content name="grilling">');
    expect(result.output).toContain(
      "Base directory for this skill: /tmp/grilling",
    );
    expect(result.output).toContain("Ask questions about $ARGUMENTS.");
  });
});
