import { chatToBlocks } from "../render/blocks";
import { UserTurnBlockComponent } from "./UserTurnBlock";
import { AgentTurnBlockComponent } from "./AgentTurnBlock";
import { SystemBlockComponent } from "./SystemBlock";
import type { Controller } from "../../controller/controller";

export function ChatViewport({
  chat,
  busy,
  controller,
}: {
  chat: Parameters<typeof chatToBlocks>[0];
  busy: boolean;
  controller: Controller;
}) {
  const blocks = chatToBlocks(chat);

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
        if (block.type === "user-turn") {
          return <UserTurnBlockComponent key={`user-${block.turnId}`} block={block} />;
        }
        if (block.type === "system") {
          return <SystemBlockComponent key={`system-${block.turnId}`} block={block} />;
        }
        return (
          <AgentTurnBlockComponent
            key={`agent-${block.turnId}`}
            block={block}
            streaming={busy && isLast}
            controller={controller}
          />
        );
      })}
    </scrollbox>
  );
}
