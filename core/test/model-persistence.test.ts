import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  saveLastChoice,
  loadLastChoice,
} from "../src/controller/model-persistence";

describe("model-persistence", () => {
  let testFile: string;

  function choiceFile(): string {
    return testFile;
  }

  beforeEach(() => {
    testFile = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "cagent-model-persistence-")),
      "last-model.json",
    );
    fs.rmSync(testFile, { force: true });
  });

  afterEach(() => {
    fs.rmSync(testFile, { force: true });
  });

  it("saves and loads a model choice", () => {
    saveLastChoice("openai/gpt-4", "fast", testFile);
    const choice = loadLastChoice(testFile);
    expect(choice).not.toBeNull();
    expect(choice?.model).toBe("openai/gpt-4");
    expect(choice?.variant).toBe("fast");
    expect(typeof choice?.timestamp).toBe("number");
  });

  it("saves choice without variant", () => {
    saveLastChoice("llama/llama-1", undefined, testFile);
    const choice = loadLastChoice(testFile);
    expect(choice?.model).toBe("llama/llama-1");
    expect(choice?.variant).toBeUndefined();
  });

  it("returns null when no file exists", () => {
    fs.rmSync(choiceFile(), { force: true });
    const result = loadLastChoice(testFile);
    expect(result).toBeNull();
  });

  it("returns null for corrupted JSON", () => {
    const file = choiceFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ not valid json");
    const result = loadLastChoice(testFile);
    expect(result).toBeNull();
  });

  it("returns null for structurally invalid data", () => {
    const file = choiceFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ model: 123 }));
    const result = loadLastChoice(testFile);
    expect(result).toBeNull();
  });

  it("returns null for missing timestamp", () => {
    const file = choiceFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ model: "test" }));
    const result = loadLastChoice(testFile);
    expect(result).toBeNull();
  });

  it("does not throw on write failure", () => {
    expect(() =>
      saveLastChoice("openai/gpt-4", undefined, testFile),
    ).not.toThrow();
  });
});
