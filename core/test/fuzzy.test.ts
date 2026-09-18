import { describe, expect, it } from "bun:test";
import { fuzzy, filterModels } from "../src/fuzzy";

const models = ["gpt-5.6-luna", "gpt-5.1", "claude-opus"];

describe("fuzzy", () => {
  it("no query returns everything", () =>
    expect(fuzzy(models, "")).toEqual(models));
  it("subsequence matches", () =>
    expect(fuzzy(models, "gl")).toEqual(["gpt-5.6-luna"]));
  it("no match returns empty", () => expect(fuzzy(models, "zz")).toEqual([]));
  it("case-insensitive", () =>
    expect(fuzzy(models, "OPUS")).toEqual(["claude-opus"]));
});

describe("filterModels", () => {
  const entries = [
    { route: "openai", models: ["gpt-5.1", "gpt-5.6-luna"] },
    { route: "llama", models: ["llama-3"] },
  ];
  it("flattens provider/model routes", () =>
    expect(filterModels(entries, "")).toEqual([
      "openai/gpt-5.1",
      "openai/gpt-5.6-luna",
      "llama/llama-3",
    ]));
  it("filters by subsequence", () =>
    expect(filterModels(entries, "gl")).toEqual(["openai/gpt-5.6-luna"]));
});
