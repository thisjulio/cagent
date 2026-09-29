import { memo } from "react";
import { chatToBlocks, type Block } from "../render/blocks";
import { reuseBlocks } from "../render/reuse-blocks";
import { windowTranscript } from "../render/transcript-window";
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
  const [visibleTurnCount, setVisibleTurnCount] = useState(12);
  const following = useRef(true);
  const previousScrollHeight = useRef<number | undefined>(undefined);
  const pendingScrollRestore = useRef<{
    scrollTop: number;
    scrollHeight: number;
  } | null>(null);
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
  const { visibleBlocks, hiddenTurns } = useMemo(
    () => windowTranscript(blocks, visibleTurnCount),
    [blocks, visibleTurnCount],
  );
  const observability = controller.observability;
  if (observability) {
    // ponytail: session_id keeps per-session perf analysis possible —
    // summary() filters on it, so metrics without it are invisible.
    const sessionId = controller.session.id;
    observability.recordMetric("ui.chat.blocks_ms", blockBuildMs, {
      session_id: sessionId,
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
        {
          session_id: sessionId,
          "chat.item_count": chat.length,
          "chat.busy": busy,
        },
      );
      observability.recordMetric(
        "ui.chat.blocks_ms_per_second",
        (renderWindowBlockBuildMs * 1000) / (now - renderWindowStarted),
        {
          session_id: sessionId,
          "chat.item_count": chat.length,
          "chat.busy": busy,
        },
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
    const pending = pendingScrollRestore.current;
    if (pending) {
      pendingScrollRestore.current = null;
      scrollbox.scrollTo(
        pending.scrollTop +
          Math.max(0, scrollbox.scrollHeight - pending.scrollHeight),
      );
      previousScrollHeight.current = scrollbox.scrollHeight;
      return;
    }
    const previousHeight = previousScrollHeight.current;
    if (previousHeight !== undefined && !following.current) {
      const addedLines = Math.max(0, scrollbox.scrollHeight - previousHeight);
      if (addedLines) setNewLines((count) => count + addedLines);
    }
    previousScrollHeight.current = scrollbox.scrollHeight;
  }, [visibleBlocks]);
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
        {hiddenTurns > 0 ? (
          <box
            flexDirection="row"
            paddingX={2}
            onMouseDown={(event) => {
              if (event.button !== 0) return;
              const scrollbox = viewport.current;
              if (!scrollbox) return;
              pendingScrollRestore.current = {
                scrollTop: scrollbox.scrollTop,
                scrollHeight: scrollbox.scrollHeight,
              };
              following.current = false;
              scrollbox.stickyScroll = false;
              setVisibleTurnCount((count) => count + 12);
            }}
          >
            <text fg={color.text.secondary}>
              ↑ Load 12 earlier turns ({hiddenTurns} hidden)
            </text>
          </box>
        ) : null}
        {visibleBlocks.map((block, index) => {
          const isLast = index === visibleBlocks.length - 1;
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
