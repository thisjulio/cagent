import { describe, expect, test } from "bun:test";
import { helpCommands, helpDetails, helpKeys } from "../src/ui/help-catalog";

describe("interactive help catalog", () => {
  test("documents the requested commands and canonical key bindings", () => {
    for (const command of ["/usage", "/telemetry", "/lsp", "/help"])
      expect(helpCommands.some((item) => item.name === command)).toBe(true);
    for (const key of ["Esc", "Ctrl+O", "Ctrl+M", "Ctrl+W"])
      expect(helpKeys.some((item) => item.name === key)).toBe(true);
  });

  test("resolves slash commands, normalized keys, and unknown topics", () => {
    expect(helpDetails("/help")[0]).toContain("/help —");
    expect(helpDetails("Esc")[0]).toContain("Esc —");
    expect(helpDetails("ctrl+o")[0]).toContain("Ctrl+O —");
    const unknown = helpDetails("helpp");
    expect(unknown[0]).toBe("unknown topic: 'helpp'");
    expect(unknown.some((line) => line.trim() === "/help")).toBe(true);
  });
});
