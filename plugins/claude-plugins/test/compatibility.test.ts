import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverAgentFiles } from "../src/agent-files";
import { discoverCommandFiles } from "../src/command-files";

function temporaryDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cagent-claude-plugin-"));
}

describe("Claude plugin compatibility", () => {
  test("discovers TOML commands without manifest declarations", () => {
    const directory = temporaryDirectory();
    fs.writeFileSync(
      path.join(directory, "review.toml"),
      'description = "Review changes"\nprompt = "Review {{args}}"\n',
    );

    expect(discoverCommandFiles(directory)).toEqual([
      {
        name: "review",
        file: path.join(directory, "review.toml"),
        content: "Review changes\n\nReview {{args}}",
      },
    ]);
  });

  test("discovers plugin agents from Claude frontmatter", () => {
    const directory = temporaryDirectory();
    fs.writeFileSync(
      path.join(directory, "reviewer.md"),
      "---\nname: reviewer\ndescription: Reviews code\nmodel: sonnet\ntools: Bash, Read\n---\nReview the code.",
    );

    expect(discoverAgentFiles(directory)).toEqual([
      {
        name: "reviewer",
        description: "Reviews code",
        model: "sonnet",
        tools: ["Bash", "Read"],
        instructions: "Review the code.",
      },
    ]);
  });
});
