export function StatusBar({ model, tokens, contextWindow }: { model: string; tokens: number; contextWindow: number }) {
  const pct = contextWindow ? Math.round((tokens / contextWindow) * 100) : 0;
  const filled = Math.min(20, Math.round((pct / 100) * 20));
  const meter = `${"=".repeat(filled)}${"-".repeat(20 - filled)}`;
  return (
    <box border={["top"]} borderColor="#666666" height={2} flexShrink={0} flexDirection="row" justifyContent="space-between">
      <text fg="#666666">{model}</text>
      <text fg="#666666">{tokens} tok [{meter}] {pct}% · /help</text>
    </box>
  );
}
