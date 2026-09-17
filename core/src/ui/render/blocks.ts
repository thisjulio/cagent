import type { ChatItem } from "../../controller/state";
import type { ToolCategory } from "../../tool-category";

export type PromptItem = {
  type: "PROMPT";
  content: string;
  imagePaths?: string[];
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
  chatIndex: number;
};

export type ToolItem = {
  type: "TOOL";
  toolName?: string;
  toolCategory?: ToolCategory;
  cmd?: string;
  content?: string;
  isError?: boolean;
  denied?: boolean;
  running?: boolean;
  expanded?: boolean;
  durationMs?: number;
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
        turnId: item.turnId,
        author: "user",
        timestamp: item.timestamp ?? Date.now(),
        items: [{ type: "PROMPT", content: item.content, imagePaths: item.imagePaths, timestamp: item.timestamp, chatIndex: i }],
      });
    } else if (item.kind === "meta") {
      // Meta items become their own system blocks
      currentAgentBlock = null;
      blocks.push({
        type: "system",
        turnId: item.turnId,
        item: { type: "META", content: item.content, kind: item.command, timestamp: item.timestamp, chatIndex: i },
      });
    } else {
      // assistant, thinking, tool items belong to the current agent turn
      if (!currentAgentBlock || currentAgentBlock.turnId !== item.turnId) {
        currentAgentBlock = {
          type: "agent-turn",
          turnId: item.turnId,
          author: "cagent",
          subagent: item.subagent,
          timestamp: item.timestamp ?? Date.now(),
          items: [],
        };
        blocks.push(currentAgentBlock);
      }

      if (item.kind === "thinking") {
        currentAgentBlock.items.push({
          type: "THINKING",
          content: item.content,
          timestamp: item.timestamp,
          chatIndex: i,
        });
      } else if (item.kind === "tool") {
        currentAgentBlock.items.push({
          type: "TOOL",
          toolName: item.toolName,
          toolCategory: item.toolCategory,
          cmd: item.cmd,
          content: item.content,
          isError: item.isError,
          denied: item.denied,
          running: item.running,
          expanded: item.expanded,
          durationMs: item.durationMs,
          timestamp: item.timestamp,
          chatIndex: i,
        });
      } else if (item.kind === "assistant") {
        if (item.subagentHeader) {
          currentAgentBlock.subagent = item.subagent;
        }
        currentAgentBlock.items.push({
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
