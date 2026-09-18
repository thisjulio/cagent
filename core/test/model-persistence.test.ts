import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  saveLastChoice,
  loadLastChoice,
} from "../src/controller/model-persistence";

function choiceFile(): string {
  return path.join(os.homedir(), ".cagent", "last-model.json");
}

describe("model-persistence", () => {
  let backup: string | null = null;
  let hadFile = false;

  beforeEach(() => {
    const file = choiceFile();
    hadFile = fs.existsSync(file);
    if (hadFile) {
      backup = fs.readFileSync(file, "utf8");
    }
  });

  afterEach(() => {
    const file = choiceFile();
    if (hadFile && backup !== null) {
      fs.writeFileSync(file, backup);
    } else {
      fs.rmSync(file, { force: true });
    }
  });

  it("saves and loads a model choice", () => {
    saveLastChoice("openai/gpt-4", "fast");
    const choice = loadLastChoice();
    expect(choice).not.toBeNull();
    expect(choice?.model).toBe("openai/gpt-4");
    expect(choice?.variant).toBe("fast");
    expect(typeof choice?.timestamp).toBe("number");
  });

  it("saves choice without variant", () => {
    saveLastChoice("llama/llama-1");
    const choice = loadLastChoice();
    expect(choice?.model).toBe("llama/llama-1");
    expect(choice?.variant).toBeUndefined();
  });

  it("returns null when no file exists", () => {
    fs.rmSync(choiceFile(), { force: true });
    const result = loadLastChoice();
    expect(result).toBeNull();
  });

  it("returns null for corrupted JSON", () => {
    const file = choiceFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ not valid json");
    const result = loadLastChoice();
    expect(result).toBeNull();
  });

  it("returns null for structurally invalid data", () => {
    const file = choiceFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ model: 123 }));
    const result = loadLastChoice();
    expect(result).toBeNull();
  });

  it("returns null for missing timestamp", () => {
    const file = choiceFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ model: "test" }));
    const result = loadLastChoice();
    expect(result).toBeNull();
  });

  it("does not throw on write failure", () => {
    expect(() => saveLastChoice("openai/gpt-4")).not.toThrow();
  });
});
