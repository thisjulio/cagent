import { describe, expect, test } from "bun:test";
import { buildInitPrompt } from "../src/commands/init-prompt";

describe("buildInitPrompt", () => {
  const emptyDocs = {
    otherInstructions: [],
    references: [],
  };

  test("builds create instructions and includes focus", () => {
    const prompt = buildInitPrompt({
      docs: emptyDocs,
      focus: "testing",
      readOnly: false,
    });
    expect(prompt).toContain("Mode: create");
    expect(prompt).toContain("Give extra attention to: testing");
    expect(prompt).toContain("Write the file with the editing tools");
  });

  test("builds conservative update instructions", () => {
    const prompt = buildInitPrompt({
      docs: { ...emptyDocs, agentsMd: "AGENTS.md" },
      focus: "",
      readOnly: false,
    });
    expect(prompt).toContain("Mode: update");
    expect(prompt).toContain("Edit in place with minimal changes");
    expect(prompt).toContain("list every removal in the final summary");
  });

  test("prints a proposal and prohibits writes in read-only mode", () => {
    const prompt = buildInitPrompt({
      docs: { ...emptyDocs, agentsMd: "AGENTS.md" },
      focus: "",
      readOnly: true,
    });
    expect(prompt).toContain("do NOT write files");
    expect(prompt).toContain("unified diff in update mode");
  });

  test("lists detected instruction and reference sources", () => {
    const prompt = buildInitPrompt({
      docs: {
        ...emptyDocs,
        otherInstructions: [".cagent/rules"],
        references: ["README.md"],
      },
      focus: "",
      readOnly: false,
    });
    expect(prompt).toContain(".cagent/rules");
    expect(prompt).toContain("README.md");
  });
});
