import type { ChatItem } from "../../controller/state";
import { calculateUsage } from "../../usage";

export function SessionInfoPanel({
  kind,
  chat,
  tokens,
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheCreationTokens,
  providerUsage,
  model,
  sessionId,
  telemetryEnabled,
  telemetrySummary,
  contextWindow,
  timeToFirstTokenMs,
  tokensPerSecond,
  promptTokensCached,
}: {
  kind: "usage" | "telemetry";
  chat: ChatItem[];
  tokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  providerUsage: (import("../../usage").ProviderUsage & {
    timestamp: number;
  })[];
  model: string;
  sessionId: string;
  telemetryEnabled: boolean;
  telemetrySummary?: {
    file: string;
    bytes: number;
    spans: number;
    events: number;
    metrics: number;
    providerCalls: number;
    agentTurns: number;
  };
  contextWindow: number;
  timeToFirstTokenMs?: number;
  tokensPerSecond?: number;
  promptTokensCached?: number;
}) {
  const tools = chat.filter((item) => item.kind === "tool" && !item.running);
  const groups = new Map<string, { count: number; duration: number }>();
  for (const tool of tools) {
    const group = groups.get(tool.toolName ?? "unknown") ?? {
      count: 0,
      duration: 0,
    };
    group.count += 1;
    group.duration += tool.durationMs ?? 0;
    groups.set(tool.toolName ?? "unknown", group);
  }
  const modelName = model.split("/").at(-1) ?? model;
  const usage = calculateUsage(providerUsage, modelName);
  const pct = contextWindow
    ? Math.round(((tokens ?? 0) / contextWindow) * 100)
    : 0;
  const filled = Math.min(20, Math.round((pct / 100) * 20));
  const cost = usage.costUsd === null ? undefined : usage.costUsd.toFixed(4);
  return (
    <box
      border
      borderStyle="single"
      borderColor="#666666"
      paddingX={1}
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      minHeight={0}
    >
      <text fg="#d97757">
        {kind === "usage" ? "Usage" : "Session telemetry"}
      </text>
      <scrollbox flexGrow={1} flexShrink={1} minHeight={0}>
        {kind === "usage" ? (
          <>
            <text>Model: {model}</text>
            <text>
              Tokens: input {inputTokens ?? 0} · output {outputTokens ?? 0} ·
              total {tokens ?? 0}
            </text>
            <text>
              Cache read: {usage.cacheReadTokens} · cache creation:{" "}
              {usage.cacheCreationTokens}
            </text>
            <text>
              Cost: {cost ? `US${"$"}${cost}` : "n/a (model not priced)"}
            </text>
            <text>
              Last turn: TTFT{" "}
              {timeToFirstTokenMs === undefined
                ? "n/a"
                : `${timeToFirstTokenMs.toFixed(0)} ms`}{" "}
              · throughput{" "}
              {tokensPerSecond === undefined
                ? "n/a"
                : `${tokensPerSecond.toFixed(1)} tok/s`}
            </text>
            <text>
              Prompt tokens reused:{" "}
              {promptTokensCached ?? usage.cacheReadTokens}
            </text>
            <text>
              Context: {tokens ?? 0} / {contextWindow} tokens
            </text>
            <text
              fg={pct >= 90 ? "#ef4444" : pct >= 80 ? "#d97706" : "#666666"}
            >
              Context [{`${"█".repeat(filled)}${"-".repeat(20 - filled)}`}]{" "}
              {pct}%
            </text>
            <text>Last 5 turns</text>
            {providerUsage.map((turn, index) => (
              <text key={`${turn.timestamp}-${index}`}>
                Turn {index + 1}: in {turn.inputTokens} · out{" "}
                {turn.outputTokens} · cache{" "}
                {turn.cacheReadTokens + turn.cacheCreationTokens}
              </text>
            ))}
          </>
        ) : telemetryEnabled ? (
          <>
            <text>Session: {sessionId}</text>
            <text>
              Agent turns and provider usage are recorded in the local event
              stream.
            </text>
            <text>Tool calls: {tools.length}</text>
            <text>
              Agent turns: {telemetrySummary?.agentTurns ?? 0} · Provider calls:{" "}
              {telemetrySummary?.providerCalls ?? 0}
            </text>
            <text>
              Events: {telemetrySummary?.events ?? 0} · Spans:{" "}
              {telemetrySummary?.spans ?? 0} · Metrics:{" "}
              {telemetrySummary?.metrics ?? 0}
            </text>
            {[...groups].map(([name, group]) => (
              <text key={name}>
                {name}: {group.count} calls · {group.duration} ms total ·{" "}
                {Math.round(group.duration / group.count)} ms avg
              </text>
            ))}
            <text>
              Telemetry: enabled ·{" "}
              {telemetrySummary?.file ?? "events file unavailable"} ·{" "}
              {telemetrySummary?.bytes ?? 0} bytes
            </text>
          </>
        ) : (
          <text>telemetry disabled (use --telemetry to enable)</text>
        )}
      </scrollbox>
      <text fg="#666666">Esc close</text>
    </box>
  );
}
