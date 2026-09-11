import { describe, expect, it } from "bun:test";
import { slashSuggestions } from "../src/commands/suggest";

describe("slashSuggestions", () => {
  it("vazio retorna vazio", () => expect(slashSuggestions("")).toEqual([]));
  it("texto sem / retorna vazio", () => expect(slashSuggestions("oi")).toEqual([]));
  it("/ sozinho lista tudo", () =>
    expect(slashSuggestions("/").sort()).toEqual(["/compact", "/help", "/model", "/new", "/rename", "/session", "/sessions"].sort()));
  it("prefixo casa em ordem", () => expect(slashSuggestions("/se")).toEqual(["/session", "/sessions"]));
  it("case-insensitive", () => expect(slashSuggestions("/SE")).toEqual(["/session", "/sessions"]));
  it("sem casa vazio", () => expect(slashSuggestions("/zz")).toEqual([]));
});
