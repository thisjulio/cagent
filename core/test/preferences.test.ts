import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPreferences, savePreferences } from "../src/preferences";

describe("user preferences", () => {
  it("persists enabled language preferences globally", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "cagent-preferences-"),
    );
    const file = path.join(directory, "config.yml");
    savePreferences(
      [{ id: 1, text: "Always speak Portuguese", enabled: true }],
      file,
    );
    expect(loadPreferences(file)).toEqual([
      { id: 1, text: "Always speak Portuguese", enabled: true },
    ]);
  });
});
