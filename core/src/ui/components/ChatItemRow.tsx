import { Box, Text } from "ink";
import type { ChatItem } from "../../controller/state";
import { Markdown } from "../render/markdown";

export function ChatItemRow({ it, streaming }: { it: ChatItem; streaming: boolean }) {
  if (it.kind === "user") return <UserRow it={it} />;
  if (it.kind === "assistant") return <AssistantRow it={it} streaming={streaming} />;
  if (it.kind === "thinking") return <ThinkingRow it={it} streaming={streaming} />;
  if (it.kind === "tool") return <ToolRow it={it} />;
  return <Text dimColor>{it.content}</Text>;
}

function UserRow({ it }: { it: ChatItem }) {
  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} width="100%">
      <Text>
        <Text color="cyan">❯ </Text>
        {it.content}
      </Text>
    </Box>
  );
}

function AssistantRow({ it, streaming }: { it: ChatItem; streaming: boolean }) {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} width="100%">
      {!streaming && it.content ? <Markdown content={it.content} /> : <Text>{it.content || "…"}</Text>}
    </Box>
  );
}

function ThinkingRow({ it, streaming }: { it: ChatItem; streaming: boolean }) {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} width="100%" flexDirection="column">
      <Text dimColor>
        <Text color="cyan">⌁ </Text>
        {streaming ? <Text color="yellow">thinking ⋯</Text> : <Text>thinking</Text>}
      </Text>
      {it.content ? <Text dimColor>{it.content}</Text> : null}
    </Box>
  );
}

function ToolRow({ it }: { it: ChatItem }) {
  const status = it.running ? "⋯" : it.isError ? "✗" : "⏺";
  const color = it.isError ? "red" : it.running ? "yellow" : "green";
  const lines = it.content ? it.content.split("\n").length : 0;
  return (
    <Box borderStyle="round" borderColor={it.isError ? "red" : "gray"} paddingX={1} width="100%" flexDirection="column">
      <Text>
        <Text color={color}>{status} </Text>
        <Text bold>{it.toolName ?? "?"}</Text>
        {it.cmd ? (
          <Text dimColor> · {it.expanded ? it.cmd : it.cmd.length > 40 ? it.cmd.slice(0, 40) + "…" : it.cmd}</Text>
        ) : null}
        {it.running ? <Text color="yellow"> (executando…)</Text> : null}
        {it.denied ? <Text color="yellow"> (negado)</Text> : null}
        {!it.running && !it.denied && !it.expanded && lines > 0 && (
          <Text dimColor> +{lines} linha{lines === 1 ? "" : "s"} (ctrl+o)</Text>
        )}
      </Text>
      {it.expanded && it.content ? (
        <Text color={it.isError ? "red" : undefined} dimColor={!it.isError}>
          {"  " + it.content.replace(/\n/g, "\n  ")}
        </Text>
      ) : null}
    </Box>
  );
}
