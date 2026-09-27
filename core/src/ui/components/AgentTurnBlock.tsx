import { memo, useEffect, useMemo, useRef, useState } from "react";
import { TextAttributes } from "@opentui/core";
import type { AgentTurnBlock, AgentItem } from "../render/blocks";
import type { Controller } from "../../controller/controller";
import { formatTime } from "../render/time";
import { ToolItemComponent } from "./ToolItem";
import { SkillItemComponent } from "./SkillItem";
import { ThinkingItemComponent } from "./ThinkingItem";
import { cachedDiffStats } from "../../controller/diff-stats";
import { settleStreamingMarkdown } from "../render/streaming-markdown";
import { markdownSyntaxStyle } from "../render/markdown-style";
import { useTheme } from "../primitives/theme-context";
import { symbols } from "../theme/symbols";

const STREAM_BUFFER_MS = 250;

// ponytail: memoized so historic responses skip markdown re-parse while the
// last block streams; item refs stay stable via ChatViewport block reuse.
const ResponseItemComponent = memo(function ResponseItemComponent({
  item,
  streaming,
  observability,
  sessionId,
}: {
  item: Extract<AgentItem, { type: "RESPONSE" }>;
  streaming: boolean;
  observability?: Controller["observability"];
  sessionId?: string;
}) {
  const { color } = useTheme();
  // ponytail: only processed chunks reach the parser. Complete lines are
  // structurally stable, so they show immediately; the partial trailing line
  // is throttled to STREAM_BUFFER_MS. Finalization shows everything at once.
  const newlineIndex = item.content.lastIndexOf("\n");
  const committed =
    newlineIndex < 0 ? "" : item.content.slice(0, newlineIndex + 1);
  const tail =
    newlineIndex < 0 ? item.content : item.content.slice(newlineIndex + 1);
  const [tailShown, setTailShown] = useState(tail);
  const tailShownRef = useRef(tailShown);
  const latestTailRef = useRef(tail);
  const committedRef = useRef(committed);
  // ponytail: cadence starts at mount so the chunk after the initial paint
  // is buffered instead of flushing immediately (lastFlush 0 = ancient).
  const lastFlush = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    latestTailRef.current = tail;
    if (!streaming) {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      committedRef.current = committed;
      if (tailShownRef.current !== tail) {
        tailShownRef.current = tail;
        lastFlush.current = Date.now();
        setTailShown(tail);
      }
      return;
    }
    if (committed !== committedRef.current) {
      // ponytail: a sealed line is a natural flush point — show everything.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      committedRef.current = committed;
      tailShownRef.current = tail;
      lastFlush.current = Date.now();
      setTailShown(tail);
      return;
    }
    if (tail === tailShownRef.current) return;
    const wait = STREAM_BUFFER_MS - (Date.now() - lastFlush.current);
    if (wait <= 0) {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      lastFlush.current = Date.now();
      tailShownRef.current = tail;
      setTailShown(tail);
    } else if (!timer.current) {
      timer.current = setTimeout(() => {
        timer.current = null;
        lastFlush.current = Date.now();
        tailShownRef.current = latestTailRef.current;
        setTailShown(latestTailRef.current);
      }, wait);
    }
  }, [committed, tail, streaming]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  // ponytail: settled tail closes partial trailing constructs for display
  // only, so markers don't flash on every chunk; finalized content passes
  // through untouched.
  // A newly sealed line already contains the previous tail. Do not append
  // the buffered tail again before the effect flushes the new one.
  const visibleTail = committed === committedRef.current ? tailShown : tail;
  const raw = streaming ? committed + visibleTail : item.content;
  const content = streaming ? settleStreamingMarkdown(raw) : raw;
  // ponytail: counts actual markdown sets (post-buffer), so per-session
  // telemetry shows what the parser really re-parsed — renders_per_second
  // only counts App bumps and doesn't move with the buffer.
  const shownContent = useRef<string | null>(null);
  if (content && content !== shownContent.current) {
    shownContent.current = content;
    observability?.recordMetric("ui.chat.markdown_sets", 1, {
      ...(sessionId ? { session_id: sessionId } : {}),
    });
  }
  const syntaxStyle = markdownSyntaxStyle(color);
  return (
    <box flexDirection="row" minWidth={0}>
      <text fg={color.accent}>└─ </text>
      <box flexGrow={1} flexBasis={0} minWidth={0} paddingLeft={1}>
        {content ? (
          <markdown
            content={content}
            syntaxStyle={syntaxStyle}
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
});

export const AgentTurnBlockComponent = memo(function AgentTurnBlockComponent({
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
  const changes = useMemo(
    () =>
      block.items.filter(
        (item): item is Extract<AgentItem, { type: "TOOL" }> =>
          item.type === "TOOL" && item.changesWorkspace === true,
      ),
    [block.items],
  );
  const stats = useMemo(
    () =>
      changes.reduce(
        (total, item) => {
          const diff =
            item.display?.kind === "diff"
              ? cachedDiffStats(item.display)
              : { added: 0, removed: 0 };
          return {
            added: total.added + diff.added,
            removed: total.removed + diff.removed,
          };
        },
        { added: 0, removed: 0 },
      ),
    [changes],
  );
  const fileCount = useMemo(() => {
    const files = new Set(changes.flatMap((item) => item.changedPaths ?? []));
    return files.size || changes.length;
  }, [changes]);
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
              key={`thinking-${item.chatIndex}`}
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
              key={`skill-${item.chatIndex}`}
              item={item}
              onClick={() => controller.toggleToolExpand(item.chatIndex)}
            />
          );
        }
        if (item.type === "TOOL") {
          return (
            <ToolItemComponent
              key={`tool-${item.chatIndex}`}
              item={item}
              onClick={() => controller.toggleToolExpand(item.chatIndex)}
              terminalWidth={terminalWidth}
            />
          );
        }
        return (
          <ResponseItemComponent
            key={`response-${item.chatIndex}`}
            item={item}
            streaming={
              streaming && latestTurn && index === block.items.length - 1
            }
            observability={controller.observability}
            sessionId={controller.session.id}
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
});
