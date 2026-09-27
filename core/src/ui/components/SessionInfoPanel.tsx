import type { ChatItem } from "../../controller/state";
import { calculateUsage, canDisplayCost } from "../../usage";
import { useTheme } from "../primitives/theme-context";
import { Progress } from "../primitives/Progress";
import { Panel } from "../primitives/Panel";
import { Scrollable } from "../primitives/Scrollable";

export function SessionInfoPanel({
  kind,
  chat,
  tokens,
  inputTokens,
  outputTokens,
  providerUsage,
  usageTotals,
  model,
  provider,
  modelPrices,
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
  providerUsage: (import("../../usage").ProviderUsage & {
    timestamp: number;
  })[];
  usageTotals: import("../../usage").ProviderUsage;
  model: string;
  provider: string;
  modelPrices?: Record<string, import("../../usage").ModelPrice>;
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
  const { color } = useTheme();
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
  const usage = calculateUsage([usageTotals], model, modelPrices);
  const pct = contextWindow
    ? Math.round(((tokens ?? 0) / contextWindow) * 100)
    : 0;
  const cost = usage.costUsd === null ? undefined : usage.costUsd.toFixed(4);
  return (
    <box flexGrow={1} flexShrink={1} minHeight={0}>
      <Panel title={kind === "usage" ? "Usage" : "Session telemetry"} grow>
        <Scrollable>
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
              {canDisplayCost(model, provider) && (
                <text>
                  Cost: {cost ? `US${"$"}${cost}` : "model price unavailable"}
                </text>
              )}
              <text>
                Last turn: TTFT{" "}
                {timeToFirstTokenMs === undefined
                  ? "unavailable"
                  : `${timeToFirstTokenMs.toFixed(0)} ms`}{" "}
                · throughput{" "}
                {tokensPerSecond === undefined
                  ? "unavailable"
                  : `${tokensPerSecond.toFixed(1)} tok/s`}
              </text>
              <text>
                Prompt tokens reused:{" "}
                {promptTokensCached ?? usage.cacheReadTokens}
              </text>
              <text>
                Context: {tokens ?? 0} / {contextWindow} tokens
              </text>
              <box flexDirection="row">
                <text
                  fg={
                    pct >= 90
                      ? color.status.danger
                      : pct >= 80
                        ? color.status.warning
                        : color.text.muted
                  }
                >
                  Context{" "}
                </text>
                <Progress
                  value={tokens ?? 0}
                  maximum={contextWindow}
                  width={20}
                />
                <text fg={color.text.muted}> {pct}%</text>
              </box>
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
                Agent turns: {telemetrySummary?.agentTurns ?? 0} · Provider
                calls: {telemetrySummary?.providerCalls ?? 0}
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
        </Scrollable>
        <text fg={color.text.muted}>Esc close</text>
      </Panel>
    </box>
  );
}
