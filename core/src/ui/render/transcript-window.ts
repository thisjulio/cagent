import type { Block } from "./blocks";

export function windowTranscript(
  blocks: Block[],
  visibleTurnLimit: number,
): { visibleBlocks: Block[]; hiddenTurns: number } {
  const starts = blocks.flatMap((block, index) =>
    block.type === "user-turn" ? [index] : [],
  );
  const hiddenTurns = Math.max(0, starts.length - visibleTurnLimit);
  return {
    visibleBlocks: blocks.slice(starts[hiddenTurns] ?? 0),
    hiddenTurns,
  };
}
