import { describe, expect, it } from "bun:test";
import { fuzzy, filterModels } from "../src/fuzzy";

const models = ["gpt-5.6-luna", "gpt-5.1", "claude-opus"];

describe("fuzzy", () => {
  it("sem query retorna tudo", () => expect(fuzzy(models, "")).toEqual(models));
  it("subsequência casa", () => expect(fuzzy(models, "gl")).toEqual(["gpt-5.6-luna"]));
  it("sem casa vazio", () => expect(fuzzy(models, "zz")).toEqual([]));
  it("case-insensitive", () => expect(fuzzy(models, "OPUS")).toEqual(["claude-opus"]));
});

describe("filterModels", () => {
  const entries = [
    { route: "openai", models: ["gpt-5.1", "gpt-5.6-luna"] },
    { route: "llama", models: ["llama-3"] },
  ];
  it("achata rotas do provider/modelo", () =>
    expect(filterModels(entries, "")).toEqual(["openai/gpt-5.1", "openai/gpt-5.6-luna", "llama/llama-3"]));
  it("filtra por subsequência", () => expect(filterModels(entries, "gl")).toEqual(["openai/gpt-5.6-luna"]));
});
