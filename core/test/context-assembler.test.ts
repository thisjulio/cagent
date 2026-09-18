import { describe, expect, it } from "bun:test";
import type { Message } from "@cagent/sdk";
import {
  assembleContext,
  type ContextTurn,
  type RetentionClass,
} from "../src/context/context-assembler";

function turn(
  id: string,
  content: string,
  retention: RetentionClass = "retrievable",
): ContextTurn {
  return {
    id,
    retention,
    messages: [{ role: "user", content }],
  };
}

describe("context assembler", () => {
  it("keeps essential context, checkpoint, and the recent sliding window", () => {
    const system: Message = { role: "system", content: "system" };
    const result = assembleContext({
      system,
      checkpoint: "goal: preserve context",
      turns: [
        turn("old", "old"),
        turn("recent-1", "one"),
        turn("recent-2", "two"),
      ],
      recentTurnCount: 2,
    });

    expect(result.messages.map((message) => message.content)).toEqual([
      "system",
      "[context checkpoint]\ngoal: preserve context",
      "one",
      "two",
    ]);
    expect(result.manifest.slidingWindowTurnIds).toEqual([
      "recent-1",
      "recent-2",
    ]);
    expect(result.omitted.map((item) => item.id)).toEqual(["turn:old"]);
  });

  it("keeps essential turns even when they are older than the sliding window", () => {
    const result = assembleContext({
      system: { role: "system", content: "system" },
      turns: [
        turn("decision", "keep this", "essential"),
        turn("recent", "recent"),
      ],
      recentTurnCount: 1,
    });

    expect(result.messages.map((message) => message.content)).toEqual([
      "system",
      "keep this",
      "recent",
    ]);
    expect(result.manifest.essentialTurnIds).toEqual(["decision"]);
  });

  it("includes explicitly retrieved turns without making them permanent", () => {
    const result = assembleContext({
      system: { role: "system", content: "system" },
      turns: [turn("recent", "recent")],
      retrieved: [turn("old", "retrieved")],
      recentTurnCount: 1,
    });

    expect(result.messages.map((message) => message.content)).toEqual([
      "system",
      "recent",
      "retrieved",
    ]);
    expect(result.manifest.retrievedTurnIds).toEqual(["old"]);
    expect(
      result.manifest.included.find((item) => item.id === "turn:old")
        ?.retention,
    ).toBe("retrievable");
  });
});
