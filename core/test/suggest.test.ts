import { describe, expect, it } from "bun:test";
import { slashSuggestions } from "../src/commands/suggest";

describe("slashSuggestions", () => {
  it("empty input returns empty", () => expect(slashSuggestions("")).toEqual([]));
  it("text without / returns empty", () => expect(slashSuggestions("hi")).toEqual([]));
  it("a lone / lists everything", () =>
    expect(slashSuggestions("/").sort()).toEqual(["/compact", "/help", "/model", "/new", "/reload-skills", "/rename", "/session", "/sessions"].sort()));
  it("prefix matches in order", () => expect(slashSuggestions("/se")).toEqual(["/session", "/sessions"]));
  it("case-insensitive", () => expect(slashSuggestions("/SE")).toEqual(["/session", "/sessions"]));
  it("no match returns empty", () => expect(slashSuggestions("/zz")).toEqual([]));
});
