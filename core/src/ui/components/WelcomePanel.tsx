import { useTheme } from "../primitives/theme-context";
import { symbols } from "../theme/symbols";
import { responsiveSize } from "../theme/breakpoints";
import { useTerminalDimensions } from "@opentui/react";

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
  const { color } = useTheme();
  const { width } = useTerminalDimensions();
  const compact = responsiveSize(width) === "compact";
  const tip =
    WELCOME_LINES[Math.floor(Date.now() / 5000) % WELCOME_LINES.length];
  return (
    <box
      width="100%"
      flexGrow={1}
      minHeight={0}
      border={["top"]}
      borderColor={color.border.default}
      alignItems="center"
      justifyContent="center"
      flexDirection="column"
      gap={1}
    >
      <text fg={color.accent}>{symbols.selected} cagent</text>
      <text fg={color.text.secondary}>{tip}</text>
      <text fg={color.text.muted}>
        {compact ? project.split("/").at(-1) : project} · {model} ·{" "}
        {permissionMode}
      </text>
      <text fg={color.text.muted}>
        loaded: {skillCount} skills · {agentCount} agents · {mcpCount} MCP
        servers
      </text>
      <text fg={color.text.muted}>
        Tip: try “explain this project” or press / for commands
      </text>
    </box>
  );
}
