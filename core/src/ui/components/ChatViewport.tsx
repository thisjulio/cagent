import { memo } from "react";
import { chatToBlocks, type AgentItem, type Block } from "../render/blocks";
import { UserTurnBlockComponent } from "./UserTurnBlock";
import { AgentTurnBlockComponent } from "./AgentTurnBlock";
import { SystemBlockComponent } from "./SystemBlock";
import type { Controller } from "../../controller/controller";
import { useTerminalDimensions, useRenderer } from "@opentui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useTheme } from "../primitives/theme-context";

let renderWindowStarted = performance.now();
let renderWindowCount = 0;
let renderWindowBlockBuildMs = 0;

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
  if (a.type === "user-turn" || b.type === "user-turn") return a === b;
  if (a.type === "system" || b.type === "system") return a === b;
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
function reuseBlocks(previous: Block[], next: Block[]): Block[] {
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

// ponytail: memo on props works because chat is mutated in place (stable
// ref) and version is the invalidation key; unrelated bumps skip everything.
export const ChatViewport = memo(function ChatViewport({
  chat,
  busy,
  controller,
  version,
}: {
  chat: Parameters<typeof chatToBlocks>[0];
  busy: boolean;
  controller: Controller;
  version: number;
}) {
  const { width } = useTerminalDimensions();
  const renderer = useRenderer();
  const { color } = useTheme();
  const viewport = useRef<ScrollBoxRenderable>(null);
  const [newLines, setNewLines] = useState(0);
  const following = useRef(true);
  const previousScrollHeight = useRef<number | undefined>(undefined);
  const previousBlocks = useRef<Block[]>([]);
  // ponytail: safety net for direct chat mutations that bypass the version
  // bump (tests do this); production writes always bump chatVersion.
  const lastItem = chat[chat.length - 1];
  const tailSig = lastItem?.content?.length ?? 0;
  const { blocks, blockBuildMs } = useMemo(() => {
    const started = performance.now();
    // ponytail: chat keeps its reference (in-place mutation), so version —
    // bumped on every chat write — is the dep, not chat itself.
    const merged = reuseBlocks(previousBlocks.current, chatToBlocks(chat));
    previousBlocks.current = merged;
    return { blocks: merged, blockBuildMs: performance.now() - started };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, chat.length, tailSig]);
  const observability = controller.observability;
  if (observability) {
    observability.recordMetric("ui.chat.blocks_ms", blockBuildMs, {
      "chat.item_count": chat.length,
      "chat.block_count": blocks.length,
      "chat.busy": busy,
    });
    renderWindowCount++;
    renderWindowBlockBuildMs += blockBuildMs;
    const now = performance.now();
    if (now - renderWindowStarted >= 1000) {
      observability.recordMetric(
        "ui.chat.renders_per_second",
        (renderWindowCount * 1000) / (now - renderWindowStarted),
        { "chat.item_count": chat.length, "chat.busy": busy },
      );
      observability.recordMetric(
        "ui.chat.blocks_ms_per_second",
        (renderWindowBlockBuildMs * 1000) / (now - renderWindowStarted),
        { "chat.item_count": chat.length, "chat.busy": busy },
      );
      renderWindowStarted = now;
      renderWindowCount = 0;
      renderWindowBlockBuildMs = 0;
    }
  }
  useEffect(() => {
    const onPageScroll = (direction: -1 | 1) => {
      const scrollbox = viewport.current;
      if (!scrollbox) return;
      const pageHeight = Math.ceil(scrollbox.viewport.height * 0.8);
      if (direction < 0) {
        following.current = false;
        scrollbox.stickyScroll = false;
        scrollbox.scrollTo(scrollbox.scrollTop - pageHeight);
      } else {
        const atBottom =
          scrollbox.scrollTop + scrollbox.viewport.height >=
          scrollbox.scrollHeight;
        if (atBottom) return;
        scrollbox.scrollTo(scrollbox.scrollTop + pageHeight);
        if (
          scrollbox.scrollTop + scrollbox.viewport.height >=
          scrollbox.scrollHeight
        ) {
          setNewLines(0);
          following.current = true;
          scrollbox.stickyScroll = true;
        }
      }
    };
    renderer.on("cagent:page-scroll", onPageScroll);
    return () => {
      renderer.off("cagent:page-scroll", onPageScroll);
    };
  }, [renderer]);
  useEffect(() => {
    const scrollbox = viewport.current;
    if (!scrollbox) return;
    const previousHeight = previousScrollHeight.current;
    if (previousHeight !== undefined && !following.current) {
      const addedLines = Math.max(0, scrollbox.scrollHeight - previousHeight);
      if (addedLines) setNewLines((count) => count + addedLines);
    }
    previousScrollHeight.current = scrollbox.scrollHeight;
  }, [blocks]);
  return (
    <box flexGrow={1} minHeight={0} width="100%" flexDirection="column">
      {newLines > 0 ? (
        <box
          flexDirection="row"
          onMouseDown={(event) => {
            if (event.button === 0) {
              const scrollbox = viewport.current;
              if (scrollbox) {
                scrollbox.scrollTo(scrollbox.scrollHeight);
                scrollbox.stickyScroll = true;
              }
              following.current = true;
              setNewLines(0);
            }
          }}
        >
          <text fg={color.text.secondary}>
            ↓ {newLines} new lines · End to follow
          </text>
        </box>
      ) : null}
      <scrollbox
        ref={viewport}
        flexGrow={1}
        minHeight={0}
        width="100%"
        border={["top"]}
        borderColor={color.border.default}
        scrollY
        stickyScroll={following.current}
        stickyStart="bottom"
        verticalScrollbarOptions={{ visible: false }}
        onMouseScroll={(event) => {
          const scrollbox = viewport.current;
          if (!scrollbox) return;
          if (event.scroll?.direction === "up") {
            following.current = false;
            scrollbox.stickyScroll = false;
          } else if (
            event.scroll?.direction === "down" &&
            scrollbox.scrollTop + scrollbox.viewport.height >=
              scrollbox.scrollHeight
          ) {
            following.current = true;
            scrollbox.stickyScroll = true;
            setNewLines(0);
          }
        }}
      >
        {blocks.map((block, index) => {
          const isLast = index === blocks.length - 1;
          const key =
            block.type === "agent-turn"
              ? `${block.type}-${block.turnId ?? block.timestamp}`
              : `${block.type}-${block.turnId ?? index}`;
          if (block.type === "user-turn") {
            return <UserTurnBlockComponent key={key} block={block} />;
          }
          if (block.type === "system") {
            return <SystemBlockComponent key={key} block={block} />;
          }
          return (
            <AgentTurnBlockComponent
              key={key}
              block={block}
              streaming={busy && isLast}
              latestTurn={isLast}
              controller={controller}
              terminalWidth={width}
            />
          );
        })}
      </scrollbox>
    </box>
  );
});
