export function PendingAsk({ ask }: { ask: { tool: string; cmd: string } }) {
  return (
    <box flexDirection="column" flexShrink={0}>
      <text fg="yellow">
        ! {ask.tool}: {ask.cmd}
      </text>
      <text fg="yellow">
        allow? y = now | n = deny | a = always allow this command
      </text>
    </box>
  );
}
