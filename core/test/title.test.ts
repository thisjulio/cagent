import { describe, expect, it } from "bun:test";
import { formatHeaderTitle } from "../src/ui/render/title";

describe("formatHeaderTitle", () => {
  it("uses the available width instead of a fixed title limit", () => {
    expect(formatHeaderTitle("Improve Session Titles", 80)).toBe(
      "cagent | Improve Session Titles",
    );
    expect(formatHeaderTitle("Improve Session Titles", 30)).toBe(
      "cagent | Improve Session…",
    );
  });

  it("keeps narrow terminals usable", () => {
    expect(formatHeaderTitle("A long title", 10)).toBe("cagent | A…");
    expect(formatHeaderTitle("", 80)).toBe("cagent");
  });
});
