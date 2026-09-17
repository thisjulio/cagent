# Spec: Turn-Based Block UI Architecture

## Problem

The current chat UI renders a flat list of `ChatItem`s with fragile adjacency-based logic for grouping (e.g., `showAgentLabel` depends on checking the previous item's kind). Adding new item types requires touching multiple files, and the UI cannot easily support block-level interactions like collapsing entire agent responses.

## Goals

1. Make it easy to add new item types without touching existing rendering logic
2. Replace fragile adjacency-based grouping with explicit data structure
3. Enable future block-level interactions (collapse/expand entire turns)
4. Ensure session persistence supports full UI reconstruction
5. Maintain declarative, component-based architecture

## Design Decisions

### Q1: Motivation
- Difficulty adding new item types (touches multiple files)
- Fragile `showAgentLabel` logic based on item adjacency
- Interest in future block-level layouts (collapse entire turns)

### Q2: What is a "Block"?
A block represents a **turn**: one user message OR one complete agent response sequence (thinking + tool calls + final response). Each block has:
- A header with author and timestamp
- An ordered list of items

### Q3: Item Types
Map 1:1 from existing `ChatItem.kind` values:
- `user` → PROMPT item
- `assistant` → RESPONSE item
- `thinking` → THINKING item
- `tool` → TOOL item
- `meta` → separate SystemBlock (not part of user/agent turns)

### Q4: Transformation Location
Pure function `chatToBlocks(chat: ChatItem[]): Block[]` in dedicated file `core/src/ui/render/blocks.ts`. Follows AGENTS.md rule: pure functions belong in their own file.

### Q5: Declarative Approach
Each block type is a separate React component. Items within blocks are rendered by type-specific functions.

### Persistence Decisions

### Q16: What to Persist
All fields needed for UI reconstruction are persisted:
- `durationMs`, `toolCategory`, `cmd`, `denied` on tool records
- `subagentHeader` on assistant records
- `expanded` state IS persisted (user's choice)

### Q17: TurnId Propagation
Generated in `submitMessage()` (already exists as local variable), propagated explicitly to all `session.append()` calls within that turn.

### Q18: Backward Compatibility
Old sessions without `turnId`: infer turns on load (each `user` record starts a new turn).

### Q19: File Format
Continue JSONL per session. Add `turnId` field to each record. No format versioning needed (field is optional for backward compat).

## Data Model

### Flat Model (Source of Truth)

```typescript
type ChatItem = {
  kind: "user" | "assistant" | "tool" | "meta" | "thinking";
  content: string;
  turnId: string;              // NEW: links items to their turn
  imagePaths?: string[];
  subagent?: string;
  subagentHeader?: boolean;
  toolName?: string;
  toolCategory?: ToolCategory;
  cmd?: string;
  isError?: boolean;
  denied?: boolean;
  running?: boolean;
  expanded?: boolean;
  timestamp?: number;
  command?: string;
  startedAt?: number;
  durationMs?: number;
};
```

### Derived Block Model (UI View)

```typescript
type Block =
  | UserTurnBlock
  | AgentTurnBlock
  | SystemBlock;

type UserTurnBlock = {
  type: "user-turn";
  turnId: string;
  author: "user";
  timestamp: number;
  items: [PromptItem];  // Always exactly one
};

type AgentTurnBlock = {
  type: "agent-turn";
  turnId: string;
  author: "cagent";
  subagent?: string;
  timestamp: number;
  items: AgentItem[];
};

type SystemBlock = {
  type: "system";
  turnId: string;
  item: MetaItem;
};

type PromptItem = { type: "PROMPT"; content: string; imagePaths?: string[]; timestamp?: number };
type ResponseItem = { type: "RESPONSE"; content: string; timestamp?: number };
type ThinkingItem = { type: "THINKING"; content: string; timestamp?: number };
type ToolItem = {
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
};
type MetaItem = { type: "META"; content: string; kind?: string; timestamp?: number };

type AgentItem = ThinkingItem | ToolItem | ResponseItem;
```

### Session Record (Persistence)

```jsonl
{"ts":1724150400000,"type":"user","turnId":"turn-1","payload":{"content":"hello","imagePaths":[]}}
{"ts":1724150401000,"type":"thinking","turnId":"turn-1","payload":{"content":"Let me think..."}}
{"ts":1724150402000,"type":"tool","turnId":"turn-1","payload":{"tool_call_id":"tc-1","toolName":"bash","toolCategory":"shell","cmd":"ls","durationMs":120,"expanded":false,"content":"file1\nfile2"}}
{"ts":1724150403000,"type":"assistant","turnId":"turn-1","payload":{"content":"Here are the files..."}}
```

## Component Architecture

```
ChatViewport.tsx
├── chatToBlocks(chat) → Block[]
└── blocks.map(block => BlockRenderer)
    ├── UserTurnBlock.tsx
    │   └── Header + PromptItem
    ├── AgentTurnBlock.tsx
    │   ├── Header (author + timestamp)
    │   └── items.map(item => renderItem)
    │       ├── ThinkingItem
    │       ├── ToolItem (with expand/collapse)
    │       └── ResponseItem (Markdown)
    └── SystemBlock.tsx
        └── MetaItem
```

### File Layout

| File | Responsibility |
|------|----------------|
| `core/src/ui/render/blocks.ts` | `chatToBlocks()` pure transformation function |
| `core/src/ui/components/UserTurnBlock.tsx` | User turn rendering |
| `core/src/ui/components/AgentTurnBlock.tsx` | Agent turn rendering |
| `core/src/ui/components/SystemBlock.tsx` | System/meta message rendering |
| `core/src/ui/components/ChatItemRow.tsx` | DEPRECATED (replaced by block components) |

## Migration Plan

### Phase 1: Data Model
1. Add `turnId` to `ChatItem` type
2. Generate `turnId` in `submitMessage()` and propagate to all `appendChat()` and `session.append()` calls
3. Add `turnId` to session record format

### Phase 2: Transformation Layer
4. Create `chatToBlocks()` function
5. Write unit tests for transformation (including old sessions without turnId)

### Phase 3: Components
6. Create `UserTurnBlock.tsx`, `AgentTurnBlock.tsx`, `SystemBlock.tsx`
7. Update `ChatViewport.tsx` to use blocks
8. Remove `ChatItemRow.tsx` and old `showAgentLabel` logic

### Phase 4: Persistence
9. Update `session.append()` calls to include `turnId` and new fields
10. Update `session.load()` to infer turns for old sessions
11. Persist `expanded`, `durationMs`, `toolCategory`, `cmd`, `denied`, `subagentHeader`

### Phase 5: Cleanup
12. Run `bun test` including `core/test/arch.test.ts`
13. Run `bun core/scripts/snap.tsx` and compare snapshots
14. Run `graphify update .`

## Testing Strategy

- Unit tests for `chatToBlocks()` with various inputs:
  - Empty chat
  - Single user message
  - User + agent response with thinking/tools
  - Multiple turns
  - Old session format (no turnId)
  - Meta items interspersed
- Snapshot tests for each block component
- Integration test: submit message → verify blocks render → verify persistence

## Risks

1. **Backward compatibility**: Old sessions must load correctly. Mitigation: infer turns on load.
2. **Streaming**: Blocks must handle incomplete turns (agent still responding). Mitigation: `chatToBlocks()` handles partial data naturally.
3. **Performance**: Transformation on every render. Mitigation: memoize or transform only when `chatVersion` changes.
