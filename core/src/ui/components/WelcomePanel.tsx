const WELCOME_LINES = [
  "Type an instruction to get started",
  "Ask me to explain this project",
  "Try /help to see available commands",
  "Press Ctrl+T to inspect tasks",
  "Use /sessions to switch context",
];

export function WelcomePanel() {
  return (
    <box
      flexGrow={1}
      minHeight={0}
      width="100%"
      border={["top"]}
      borderColor="#444444"
      alignItems="center"
      justifyContent="center"
      flexDirection="column"
      gap={1}
    >
      <text fg="#d97757">✦ cagent</text>
      <text fg="#aaaaaa">{WELCOME_LINES[0]}</text>
      <text fg="#666666">
        Tip: try “explain this project” or press / for commands
      </text>
    </box>
  );
}
