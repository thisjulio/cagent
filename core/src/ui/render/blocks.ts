import type { ChatItem } from "../../controller/state";
import type { ToolCategory } from "../../tool-category";
import type { ToolDisplay } from "@cagent/sdk";

export type PromptItem = {
  type: "PROMPT";
  content: string;
  queueStatus?: "queued" | "processing";
  imagePaths?: string[];
  filePaths?: string[];
  timestamp?: number;
  chatIndex: number;
};

export type ResponseItem = {
  type: "RESPONSE";
  content: string;
  timestamp?: number;
  chatIndex: number;
};

export type ThinkingItem = {
  type: "THINKING";
  content: string;
  timestamp?: number;
  expanded?: boolean;
  chatIndex: number;
};

export type ToolItem = {
  type: "TOOL";
  toolName?: string;
  title?: string;
  toolCategory?: ToolCategory;
  cmd?: string;
  content?: string;
  summary?: string;
  isError?: boolean;
  denied?: boolean;
  running?: boolean;
  expanded?: boolean;
  durationMs?: number;
  display?: ToolDisplay;
  changesWorkspace?: boolean;
  changedPaths?: string[];
  timestamp?: number;
  chatIndex: number;
};

export type MetaItem = {
  type: "META";
  content: string;
  kind?: string;
  timestamp?: number;
  chatIndex: number;
};

export type AgentItem = ThinkingItem | ToolItem | ResponseItem;

export type UserTurnBlock = {
  type: "user-turn";
  turnId: string;
  author: "user";
  timestamp: number;
  items: [PromptItem];
};

export type AgentTurnBlock = {
  type: "agent-turn";
  turnId: string;
  author: "cagent";
  subagent?: string;
  timestamp: number;
  items: AgentItem[];
};

export type SystemBlock = {
  type: "system";
  turnId: string;
  item: MetaItem;
};

export type Block = UserTurnBlock | AgentTurnBlock | SystemBlock;

export function chatToBlocks(chat: ChatItem[]): Block[] {
  const blocks: Block[] = [];
  let currentAgentBlock: AgentTurnBlock | null = null;

  for (let i = 0; i < chat.length; i++) {
    const item = chat[i];
    if (item.kind === "user") {
      // User item always starts a new user turn block
      currentAgentBlock = null;
      blocks.push({
        type: "user-turn",
        turnId: item.turnId ?? `turn-${i}`,
        author: "user",
        timestamp: item.timestamp ?? Date.now(),
        items: [
          {
            type: "PROMPT",
            content: item.content,
            queueStatus: item.queueStatus,
            imagePaths: item.imagePaths,
            filePaths: item.filePaths,
            timestamp: item.timestamp,
            chatIndex: i,
          },
        ],
      });
    } else if (item.kind === "meta") {
      // Meta items become their own system blocks
      currentAgentBlock = null;
      blocks.push({
        type: "system",
        turnId: item.turnId ?? `turn-${i}`,
        item: {
          type: "META",
          content: item.content,
          kind: item.command,
          timestamp: item.timestamp,
          chatIndex: i,
        },
      });
    } else {
      // assistant, thinking, tool items belong to the current agent turn
      if (
        !currentAgentBlock ||
        currentAgentBlock.turnId !== (item.turnId ?? currentAgentBlock.turnId)
      ) {
        currentAgentBlock = {
          type: "agent-turn",
          turnId: item.turnId ?? `turn-${i}`,
          author: "cagent",
          subagent: item.subagent,
          timestamp: item.timestamp ?? Date.now(),
          items: [],
        };
        blocks.push(currentAgentBlock);
      }
      const block = currentAgentBlock;

      if (item.kind === "thinking") {
        block.items.push({
          type: "THINKING",
          content: item.content,
          timestamp: item.timestamp,
          expanded: item.expanded,
          chatIndex: i,
        });
      } else if (item.kind === "tool") {
        block.items.push({
          type: "TOOL",
          toolName: item.toolName,
          title: item.title,
          toolCategory: item.toolCategory,
          cmd: item.cmd,
          content: item.content,
          summary: item.summary,
          isError: item.isError,
          denied: item.denied,
          running: item.running,
          expanded: item.expanded,
          durationMs: item.durationMs,
          display: item.display,
          changesWorkspace: item.changesWorkspace,
          changedPaths: item.changedPaths,
          timestamp: item.timestamp,
          chatIndex: i,
        });
      } else if (item.kind === "assistant") {
        if (item.subagentHeader) {
          block.subagent = item.subagent;
        }
        block.items.push({
          type: "RESPONSE",
          content: item.content,
          timestamp: item.timestamp,
          chatIndex: i,
        });
      }
    }
  }

  return blocks;
}
