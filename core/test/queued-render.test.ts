import { describe, expect, test } from "bun:test";
import { chatToBlocks } from "../src/ui/render/blocks";

describe("queued message rendering", () => {
  test("preserves queued status in the prompt block", () => {
    const [block] = chatToBlocks([
      { kind: "user", content: "follow up", queueStatus: "queued" },
    ]);

    expect(block).toMatchObject({
      type: "user-turn",
      items: [{ type: "PROMPT", content: "follow up", queueStatus: "queued" }],
    });
  });
});
