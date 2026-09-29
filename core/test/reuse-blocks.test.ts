import { describe, expect, it } from "bun:test";
import { appendChat } from "../src/controller/chat-buffer";
import type { ChatItem, UIState } from "../src/controller/state";
import { chatToBlocks } from "../src/ui/render/blocks";
import { reuseBlocks } from "../src/ui/render/reuse-blocks";
import { windowTranscript } from "../src/ui/render/transcript-window";

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

  it("keeps surviving turn identities when appendChat trims the buffer", () => {
    const state = { chat: [], chatVersion: 0 } as unknown as UIState;
    for (let turn = 0; turn < 200; turn++) {
      appendChat(state, {
        kind: "user",
        content: `prompt ${turn}`,
        turnId: `turn-${turn}`,
      });
      appendChat(state, {
        kind: "assistant",
        content: `response ${turn}`,
        turnId: `turn-${turn}`,
      });
    }

    const oldSurvivorId = state.chat[1].id;
    const previous = reuseBlocks([], chatToBlocks(state.chat));
    const previousVisible = windowTranscript(previous, 12).visibleBlocks;

    appendChat(state, {
      kind: "user",
      content: "prompt 200",
      turnId: "turn-200",
    });
    const next = reuseBlocks(previous, chatToBlocks(state.chat));
    const nextVisible = windowTranscript(next, 12).visibleBlocks;
    const nextByTurn = new Map(
      nextVisible.map((block) => [`${block.type}-${block.turnId}`, block]),
    );

    expect(state.chat).toHaveLength(400);
    expect(state.chat[0].id).toBe(oldSurvivorId);
    for (const block of previousVisible) {
      const reused = nextByTurn.get(`${block.type}-${block.turnId}`);
      if (reused) expect(reused).toBe(block);
    }
  });
});
