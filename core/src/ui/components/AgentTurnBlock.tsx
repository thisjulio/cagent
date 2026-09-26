import { SyntaxStyle, TextAttributes } from "@opentui/core";
import type { AgentTurnBlock, AgentItem } from "../render/blocks";
import type { Controller } from "../../controller/controller";
import { formatTime } from "../render/time";
import { ToolItemComponent } from "./ToolItem";
import { ThinkingItemComponent } from "./ThinkingItem";
import { diffStats } from "../../controller/diff-stats";

const markdownSyntaxStyle = SyntaxStyle.create();

function ResponseItemComponent({
  item,
  streaming,
}: {
  item: Extract<AgentItem, { type: "RESPONSE" }>;
  streaming: boolean;
}) {
  return (
    <box flexDirection="row" minWidth={0}>
      <text fg="#d97757">└─ </text>
      <box flexGrow={1} flexBasis={0} minWidth={0} paddingLeft={1}>
        {item.content ? (
          <markdown
            content={item.content}
            syntaxStyle={markdownSyntaxStyle}
            streaming={streaming}
            width="100%"
            minWidth={0}
            height="auto"
          />
        ) : (
          <text>...</text>
        )}
      </box>
    </box>
  );
}

export function AgentTurnBlockComponent({
  block,
  streaming,
  latestTurn,
  controller,
  terminalWidth,
}: {
  block: AgentTurnBlock;
  streaming: boolean;
  latestTurn: boolean;
  controller: Controller;
  terminalWidth: number;
}) {
  const changes = block.items.filter(
    (item): item is Extract<AgentItem, { type: "TOOL" }> =>
      item.type === "TOOL" && item.changesWorkspace === true,
  );
  const stats = changes.reduce(
    (total, item) => {
      const diff =
        item.display?.kind === "diff"
          ? diffStats(item.display.content)
          : { added: 0, removed: 0 };
      return {
        added: total.added + diff.added,
        removed: total.removed + diff.removed,
      };
    },
    { added: 0, removed: 0 },
  );
  const files = new Set(changes.flatMap((item) => item.changedPaths ?? []));
  const fileCount = files.size || changes.length;

  return (
    <box paddingX={2} width="100%" flexDirection="column" flexShrink={0}>
      <text fg="#d97757">
        cagent{block.subagent ? ` → @${block.subagent}` : ""}{" "}
        <span attributes={TextAttributes.DIM}>
          {formatTime(block.timestamp)}
        </span>
      </text>
      <text fg="#d97757">│ </text>
      {block.items.map((item, index) => {
        if (item.type === "THINKING") {
          return (
            <ThinkingItemComponent
              key={`thinking-${index}`}
              item={item}
              streaming={
                streaming && latestTurn && index === block.items.length - 1
              }
              controller={controller}
            />
          );
        }
        if (item.type === "TOOL") {
          return (
            <ToolItemComponent
              key={`tool-${index}`}
              item={item}
              onClick={() => controller.toggleToolExpand(item.chatIndex)}
              terminalWidth={terminalWidth}
            />
          );
        }
        return (
          <ResponseItemComponent
            key={`response-${index}`}
            item={item}
            streaming={streaming}
          />
        );
      })}
      {changes.length ? (
        <text fg="#888888">
          └─ {fileCount} file{fileCount === 1 ? "" : "s"}
          {changes.some((item) => item.display?.kind === "diff")
            ? ` · +${stats.added} −${stats.removed}`
            : ""}
          {" · "}
          <span fg="#d97757">/diff</span>
        </text>
      ) : null}
    </box>
  );
}
