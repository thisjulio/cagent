import { describe, expect, it } from "bun:test";
import {
  breakpoints,
  responsiveSize,
  supportsSplit,
} from "../src/ui/theme/breakpoints";
import { symbols } from "../src/ui/theme/symbols";
import { themeForTerminal, themes } from "../src/ui/theme/themes";

describe("Design System foundations", () => {
  it("maps compact, standard, wide, and split-capable terminal widths", () => {
    expect(responsiveSize(40)).toBe("compact");
    expect(responsiveSize(breakpoints.compact)).toBe("standard");
    expect(responsiveSize(80)).toBe("standard");
    expect(responsiveSize(breakpoints.wide)).toBe("wide");
    expect(supportsSplit(139)).toBe(false);
    expect(supportsSplit(breakpoints.splitCapable)).toBe(true);
  });

  it("provides transparent terminal surfaces and semantic dark/light states", () => {
    for (const theme of Object.values(themes)) {
      expect(theme.palette.background).toBe("transparent");
      expect(theme.color.status.success).not.toBe(theme.color.accent);
      expect(theme.color.status.danger).not.toBe(theme.color.accent);
      expect(theme.color.border.focused).toBe(theme.color.accent);
    }
    expect(themes.dark.color.text.primary).not.toBe(
      themes.light.color.text.primary,
    );
    expect(themeForTerminal("dark", "#eeeeee").color.text.primary).toBe(
      "#eeeeee",
    );
    expect(themeForTerminal("dark", "#eeeeee").palette.background).toBe(
      "transparent",
    );
  });

  it("centralizes symbols for state and selection", () => {
    expect(symbols.success).toBe("✓");
    expect(symbols.warning).toBe("⚠");
    expect(symbols.selected).toBe("›");
  });
});
