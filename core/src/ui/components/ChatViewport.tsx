import { chatToBlocks } from "../render/blocks";
import { UserTurnBlockComponent } from "./UserTurnBlock";
import { AgentTurnBlockComponent } from "./AgentTurnBlock";
import { SystemBlockComponent } from "./SystemBlock";
import type { Controller } from "../../controller/controller";
import { useTerminalDimensions } from "@opentui/react";

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
  return (
    <scrollbox
      flexGrow={1}
      minHeight={0}
      width="100%"
      border={["top"]}
      borderColor="#444444"
      scrollY
      stickyScroll
      stickyStart="bottom"
      justifyContent="flex-end"
      verticalScrollbarOptions={{ visible: false }}
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
  );
}
