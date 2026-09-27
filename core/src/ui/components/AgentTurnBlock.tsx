import { SyntaxStyle, TextAttributes } from "@opentui/core";
import type { AgentTurnBlock, AgentItem } from "../render/blocks";
import type { Controller } from "../../controller/controller";
import { formatTime } from "../render/time";
import { ToolItemComponent } from "./ToolItem";
import { SkillItemComponent } from "./SkillItem";
import { ThinkingItemComponent } from "./ThinkingItem";
import { diffStats } from "../../controller/diff-stats";
import { useTheme } from "../primitives/theme-context";
import { symbols } from "../theme/symbols";

const markdownSyntaxStyle = SyntaxStyle.create();

function ResponseItemComponent({
  item,
  streaming,
}: {
  item: Extract<AgentItem, { type: "RESPONSE" }>;
  streaming: boolean;
}) {
  const { color } = useTheme();
  return (
    <box flexDirection="row" minWidth={0}>
      <text fg={color.accent}>└─ </text>
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
  const { color } = useTheme();
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
  const subagentStatus =
    block.subagentStatus === "running"
      ? { icon: symbols.running, label: "working", color: color.status.warning }
      : block.subagentStatus === "success"
        ? {
            icon: symbols.success,
            label: `completed · ${((block.subagentDurationMs ?? 0) / 1000).toFixed(1)}s`,
            color: color.status.success,
          }
        : block.subagentStatus === "error"
          ? {
              icon: symbols.error,
              label: `failed · ${((block.subagentDurationMs ?? 0) / 1000).toFixed(1)}s`,
              color: color.status.danger,
            }
          : undefined;

  return (
    <box paddingX={2} width="100%" flexDirection="column" flexShrink={0}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={color.accent}>
          cagent{block.subagent ? ` → @${block.subagent}` : ""}{" "}
          <span attributes={TextAttributes.DIM}>
            {formatTime(block.timestamp)}
          </span>
        </text>
        {subagentStatus ? (
          <text fg={subagentStatus.color}>
            {subagentStatus.icon} {subagentStatus.label}
          </text>
        ) : null}
      </box>
      <text fg={color.accent}>│ </text>
      {block.items.map((item, index) => {
        if (item.type === "THINKING") {
          return (
            <ThinkingItemComponent
              key={`thinking-${index}`}
              item={item}
              streaming={
                streaming && latestTurn && index === block.items.length - 1
              }
            />
          );
        }
        if (item.type === "SKILL") {
          return (
            <SkillItemComponent
              key={`skill-${index}`}
              item={item}
              onClick={() => controller.toggleToolExpand(item.chatIndex)}
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
      {block.subagentStatus === "running" && block.items.length === 0 ? (
        <text fg={color.text.muted}>└─ waiting for subagent result</text>
      ) : block.subagentStatus === "error" && block.items.length === 0 ? (
        <text fg={color.status.danger}>└─ subagent failed</text>
      ) : null}
      {changes.length ? (
        <text fg={color.text.muted}>
          └─ {fileCount} file{fileCount === 1 ? "" : "s"}
          {changes.some((item) => item.display?.kind === "diff")
            ? ` · +${stats.added} −${stats.removed}`
            : ""}
          {" · "}
          <span fg={color.accent}>/diff</span>
        </text>
      ) : null}
    </box>
  );
}
