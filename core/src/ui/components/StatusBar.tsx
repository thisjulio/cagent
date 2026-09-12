export function StatusBar({ title, model, tokens, contextWindow }: { title: string; model: string; tokens: number; contextWindow: number }) {
  const pct = contextWindow ? Math.round((tokens / contextWindow) * 100) : 0;
  return (
    <box border={["top"]} borderColor="#666666" height={2} flexShrink={0}>
      <text fg="#666666">
        {(title || "new").slice(0, 30)} | {model} | {tokens} tok · {pct}% context · Esc interrupts · /help
      </text>
    </box>
  );
}
