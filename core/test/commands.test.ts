import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createCommandSource,
  discoverCommands,
  expandCommand,
} from "../src/commands/discovery";

describe("custom commands", () => {
  test("discovers markdown commands and expands arguments", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cagent-commands-"));
    const directory = path.join(cwd, ".cagent", "commands");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, "review.md"),
      "Review $ARGUMENTS / {{args}}",
    );
    const catalog = discoverCommands(cwd, [createCommandSource()]);
    expect(expandCommand(catalog.byName.get("review")!, "the diff")).toBe(
      "Review the diff / the diff",
    );
  });
});
