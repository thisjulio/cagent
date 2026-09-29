import { describe, expect, test } from "bun:test";
import { expandChips, pasteAsChips, toggleChip } from "../src/ui/input-chips";

describe("input paste chips", () => {
  test("collapses more than ten lines and restores the original paste", () => {
    const chips = new Map<string, string>();
    const value = Array.from({ length: 11 }, (_, i) => `line ${i + 1}`).join(
      "\n",
    );
    const result = pasteAsChips(value, chips, 0);

    expect(result.text).toBe("[pasted · 11 lines]");
    expect(expandChips(result.text, chips)).toBe(value);
  });

  test("keeps distinct collapsed pastes with the same line count", () => {
    const chips = new Map<string, string>();
    const first = Array.from({ length: 11 }, (_, i) => `first ${i}`).join("\n");
    const second = Array.from({ length: 11 }, (_, i) => `second ${i}`).join(
      "\n",
    );

    const firstChip = pasteAsChips(first, chips, 0);
    const secondChip = pasteAsChips(second, chips, 0);

    expect(firstChip.text).not.toBe(secondChip.text);
    expect(expandChips(`${firstChip.text}\n${secondChip.text}`, chips)).toBe(
      `${first}\n${second}`,
    );
  });

  test("turns pasted image paths into expandable chips", () => {
    const chips = new Map<string, string>();
    const result = pasteAsChips("check ./shot.png", chips, 0);

    expect(result.text).toBe("check [Image 1]");
    expect(expandChips(result.text, chips)).toBe("check ./shot.png");
    expect(
      toggleChip(result.text, result.text.indexOf("Image") + 2, chips)?.text,
    ).toBe("check ./shot.png");
  });
});
