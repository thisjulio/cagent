export function StatusBar({ title, model, tokens, threshold }: { title: string; model: string; tokens: number; threshold: number }) {
  const pct = threshold ? Math.round((tokens / threshold) * 100) : 0;
  return (
    <box border={["top"]} borderColor="#666666" height={2} flexShrink={0}>
      <text fg="#666666">
        {(title || "new").slice(0, 30)} | {model} | {tokens} tok · {pct}% context · Esc interrupts · /help
      </text>
    </box>
  );
}
