import { describe, expect, it } from "bun:test";
import type { ChatItem } from "../src/controller/state";
import { chatToBlocks } from "../src/ui/render/blocks";
import { reuseBlocks } from "../src/ui/render/reuse-blocks";

describe("reuseBlocks", () => {
  it("reuses stable user and system blocks across assistant updates", () => {
    const chat: ChatItem[] = [
      { kind: "user", content: "hello", turnId: "user", timestamp: 1 },
      { kind: "meta", content: "info", turnId: "system", timestamp: 2 },
      {
        kind: "assistant",
        content: "draft",
        turnId: "assistant",
        timestamp: 3,
      },
    ];
    const previous = chatToBlocks(chat);
    const next = chatToBlocks(
      chat.map((item) =>
        item.kind === "assistant" ? { ...item, content: "updated" } : item,
      ),
    );

    const reused = reuseBlocks(previous, next);

    expect(reused[0]).toBe(previous[0]);
    expect(reused[1]).toBe(previous[1]);
    expect(reused[2]).not.toBe(previous[2]);
  });
});
