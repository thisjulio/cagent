import { describe, expect, it } from "bun:test";
import type { ChatItem } from "../src/controller/state";
import { chatToBlocks } from "../src/ui/render/blocks";
import { windowTranscript } from "../src/ui/render/transcript-window";

describe("windowTranscript", () => {
  it("keeps complete recent turns and counts hidden turns", () => {
    const chat: ChatItem[] = Array.from({ length: 14 }, (_, index) => [
      {
        kind: "user" as const,
        content: `prompt ${index}`,
        turnId: `turn-${index}`,
      },
      {
        kind: "assistant" as const,
        content: `response ${index}`,
        turnId: `turn-${index}`,
      },
    ]).flat();

    const { visibleBlocks, hiddenTurns } = windowTranscript(
      chatToBlocks(chat),
      12,
    );

    expect(hiddenTurns).toBe(2);
    expect(visibleBlocks).toHaveLength(24);
    expect(new Set(visibleBlocks.map((block) => block.turnId))).toEqual(
      new Set(Array.from({ length: 12 }, (_, index) => `turn-${index + 2}`)),
    );

    const nextPage = windowTranscript(chatToBlocks(chat), 24);
    expect(nextPage.hiddenTurns).toBe(0);
    expect(nextPage.visibleBlocks).toHaveLength(28);
  });
});
