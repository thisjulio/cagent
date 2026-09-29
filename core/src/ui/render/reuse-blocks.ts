import type { AgentItem, Block } from "./blocks";

function sameItem(a: AgentItem, b: AgentItem): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "RESPONSE":
      return a.content === (b as typeof a).content;
    case "THINKING":
      return (
        a.content === (b as typeof a).content &&
        a.expanded === (b as typeof a).expanded
      );
    case "SKILL":
      return (
        a.name === (b as typeof a).name &&
        a.content === (b as typeof a).content &&
        a.expanded === (b as typeof a).expanded &&
        a.isError === (b as typeof a).isError &&
        a.denied === (b as typeof a).denied &&
        a.running === (b as typeof a).running &&
        a.chatIndex === (b as typeof a).chatIndex
      );
    case "TOOL":
      return (
        a.toolName === (b as typeof a).toolName &&
        a.title === (b as typeof a).title &&
        a.toolCategory === (b as typeof a).toolCategory &&
        a.cmd === (b as typeof a).cmd &&
        a.content === (b as typeof a).content &&
        a.summary === (b as typeof a).summary &&
        a.detail === (b as typeof a).detail &&
        a.isError === (b as typeof a).isError &&
        a.denied === (b as typeof a).denied &&
        a.running === (b as typeof a).running &&
        a.preparing === (b as typeof a).preparing &&
        a.expanded === (b as typeof a).expanded &&
        a.durationMs === (b as typeof a).durationMs &&
        a.display === (b as typeof a).display &&
        a.changesWorkspace === (b as typeof a).changesWorkspace &&
        a.changedPaths === (b as typeof a).changedPaths &&
        a.chatIndex === (b as typeof a).chatIndex
      );
  }
}

function sameBlock(a: Block, b: Block): boolean {
  if (a.type !== b.type || a.turnId !== b.turnId) return false;
  if (a.type === "user-turn" || b.type === "user-turn") {
    if (a.type !== "user-turn" || b.type !== "user-turn") return false;
    const previous = a.items[0];
    const next = b.items[0];
    return (
      previous.content === next.content &&
      previous.queueStatus === next.queueStatus &&
      previous.imagePaths === next.imagePaths &&
      previous.filePaths === next.filePaths &&
      previous.timestamp === next.timestamp &&
      previous.chatIndex === next.chatIndex
    );
  }
  if (a.type === "system" || b.type === "system") {
    if (a.type !== "system" || b.type !== "system") return false;
    return (
      a.item.content === b.item.content &&
      a.item.kind === b.item.kind &&
      a.item.timestamp === b.item.timestamp &&
      a.item.chatIndex === b.item.chatIndex
    );
  }
  if (
    a.subagent !== (b as typeof a).subagent ||
    a.subagentStatus !== (b as typeof a).subagentStatus ||
    a.items.length !== (b as typeof a).items.length
  )
    return false;
  return a.items.every((item, index) =>
    sameItem(item, (b as typeof a).items[index]),
  );
}

// ponytail: reuse previous block/item refs for unchanged history so memo'd
// leaves skip them; only new/changed tails get fresh objects.
export function reuseBlocks(previous: Block[], next: Block[]): Block[] {
  if (previous.length !== next.length) return next;
  return next.map((block, index) => {
    const old = previous[index];
    if (sameBlock(old, block)) return old;
    if (
      old.type === "agent-turn" &&
      block.type === "agent-turn" &&
      old.turnId === block.turnId &&
      block.items.length >= old.items.length
    ) {
      const items = block.items.map((item, itemIndex) =>
        itemIndex < old.items.length && sameItem(old.items[itemIndex], item)
          ? old.items[itemIndex]
          : item,
      );
      if (items.every((item, itemIndex) => item === block.items[itemIndex]))
        return block;
      return { ...block, items };
    }
    return block;
  });
}
