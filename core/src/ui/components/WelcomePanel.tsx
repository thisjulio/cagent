export const WELCOME_LINES = [
  "Type an instruction to get started",
  "Ask me to explain this project",
  "Try /help to see available commands",
  "Press Ctrl+T to inspect tasks",
  "Use /sessions to switch context",
];

export function WelcomePanel({
  project = "current project",
  model = "default model",
  permissionMode = "ask",
  skillCount = 0,
  agentCount = 0,
  mcpCount = 0,
}: {
  project?: string;
  model?: string;
  permissionMode?: string;
  skillCount?: number;
  agentCount?: number;
  mcpCount?: number;
}) {
  const tip =
    WELCOME_LINES[Math.floor(Date.now() / 5000) % WELCOME_LINES.length];
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
      <text fg="#aaaaaa">{tip}</text>
      <text fg="#777777">
        {project} · {model} · permission: {permissionMode}
      </text>
      <text fg="#777777">
        loaded: {skillCount} skills · {agentCount} agents · {mcpCount} MCP
        servers
      </text>
      <text fg="#666666">
        Tip: try “explain this project” or press / for commands
      </text>
    </box>
  );
}
