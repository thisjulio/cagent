export function StatusBar({ title, model, tokens, contextWindow }: { title: string; model: string; tokens: number; contextWindow: number }) {
  const pct = contextWindow ? Math.round((tokens / contextWindow) * 100) : 0;
  const filled = Math.min(20, Math.round((pct / 100) * 20));
  const meter = `${"=".repeat(filled)}${"-".repeat(20 - filled)}`;
  return (
    <box border={["top"]} borderColor="#666666" height={2} flexShrink={0}>
      <text fg="#666666">
        {(title || "new").slice(0, 24)} | {model} | {tokens} tok · ctx {tokens}/{contextWindow} [{meter}] {pct}% · /help
      </text>
    </box>
  );
}
