import { describe, expect, it } from "bun:test";
import {
  slashSuggestions,
  subagentSuggestions,
  inputSuggestions,
} from "../src/commands/suggest";

describe("slashSuggestions", () => {
  it("empty input returns empty", () =>
    expect(slashSuggestions("")).toEqual([]));
  it("text without / returns empty", () =>
    expect(slashSuggestions("hi")).toEqual([]));
  it("a lone / lists everything", () =>
    expect(slashSuggestions("/").sort()).toEqual(
      [
        "/compact",
        "/help",
        "/init",
        "/lsp",
        "/model",
        "/new",
        "/preference",
        "/reload-skills",
        "/rename",
        "/session",
        "/sessions",
        "/skill",
        "/tasks",
        "/telemetry",
        "/usage",
        "/variant",
      ].sort(),
    ));
  it("prefix matches in order", () =>
    expect(slashSuggestions("/se")).toEqual(["/session", "/sessions"]));
  it("case-insensitive", () =>
    expect(slashSuggestions("/SE")).toEqual(["/session", "/sessions"]));
  it("no match returns empty", () =>
    expect(slashSuggestions("/zz")).toEqual([]));
  it("suggests discovered skills after /skill", () =>
    expect(
      slashSuggestions("/skill gr", ["grill-me", "grilling", "deploy"]),
    ).toEqual(["/skill grill-me", "/skill grilling"]));
  it("suggests registered plugin commands", () =>
    expect(slashSuggestions("/", [], ["memory"])).toContain("/memory"));
  it("suggests plugin subcommands", () =>
    expect(
      slashSuggestions("/memory a", [], [], { memory: ["add", "archive"] }),
    ).toEqual(["/memory add", "/memory archive"]));
  it("suggests built-in preference subcommands", () =>
    expect(slashSuggestions("/preference e")).toEqual(["/preference edit"]));
});

describe("subagent suggestions", () => {
  it("suggests agents after @", () =>
    expect(
      subagentSuggestions("@arch", [
        "architecture-reviewer",
        "security-reviewer",
      ]),
    ).toEqual(["@architecture-reviewer"]));
  it("does not suggest in a normal task", () =>
    expect(
      subagentSuggestions("check @arch", ["architecture-reviewer"]),
    ).toEqual([]));
  it("routes input completion by prefix", () =>
    expect(inputSuggestions("@", [], [], ["reviewer"])).toEqual(["@reviewer"]));
});
