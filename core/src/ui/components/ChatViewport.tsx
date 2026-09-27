import { chatToBlocks } from "../render/blocks";
import { UserTurnBlockComponent } from "./UserTurnBlock";
import { AgentTurnBlockComponent } from "./AgentTurnBlock";
import { SystemBlockComponent } from "./SystemBlock";
import type { Controller } from "../../controller/controller";
import { useTerminalDimensions, useRenderer } from "@opentui/react";
import { useEffect, useRef, useState } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useTheme } from "../primitives/theme-context";

let renderWindowStarted = performance.now();
let renderWindowCount = 0;
let renderWindowBlockBuildMs = 0;

export function ChatViewport({
  chat,
  busy,
  controller,
}: {
  chat: Parameters<typeof chatToBlocks>[0];
  busy: boolean;
  controller: Controller;
}) {
  const { width } = useTerminalDimensions();
  const renderer = useRenderer();
  const { color } = useTheme();
  const viewport = useRef<ScrollBoxRenderable>(null);
  const [newLines, setNewLines] = useState(0);
  const following = useRef(true);
  const previousScrollHeight = useRef<number | undefined>(undefined);
  const renderStarted = performance.now();
  const blocks = chatToBlocks(chat);
  const blockBuildMs = performance.now() - renderStarted;
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
              ? `${block.type}-${block.turnId ?? index}-${index}`
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
}
