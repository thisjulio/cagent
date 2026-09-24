export const helpCommands = (
  [
    ["/model", "switch model (live-search picker)"],
    ["/sessions", "resume a previous session"],
    ["/compact", "summarize the conversation to free context"],
    ["/new", "start a fresh session"],
    ["/rename", "rename the current session"],
    ["/skill <name>", "load a skill; bare /skill opens a picker"],
    ["/reload-skills", "rescan skill directories"],
    ["/help", "open this panel; /help <topic> shows details"],
    ["/auth.openai", "manage OpenAI OAuth credentials"],
    ["/usage", "tokens, cost and cache dashboard"],
    ["/telemetry", "session telemetry summary"],
    ["/lsp", "LSP doctor and one-click install"],
    ["/init", "create a project instruction file"],
  ] as const
).map(([name, description]) => ({ name, description }));

export const helpKeys = [
  ["Enter", "send prompt"],
  ["Esc", "clear typed text / close panel; interrupt a running turn"],
  ["Tab", "cycle command autocomplete"],
  ["Ctrl+C", "clear input, cancel turn, or exit with code 130"],
  ["Ctrl+O", "open tool diff viewer, then cycle forward"],
  ["Shift+Ctrl+O", "cycle backward through tool calls"],
  ["Ctrl+M", "cycle permission mode ask → auto → read-only"],
  ["y / n / a", "allow / deny / always-allow the current permission request"],
  ["↑↓", "edit history navigation and scroll panels"],
  ["PgUp/PgDn", "page scroll in panels"],
  ["Ctrl+U", "delete to line start"],
  ["Ctrl+W", "delete previous word"],
  ["Ctrl+A / Ctrl+E", "jump to start / end"],
  ["Ctrl+Left/Right", "move by word"],
  ["Home / End", "jump to line ends"],
].map(([name, description]) => ({ name, description }));

export function helpDetails(topic: string): string[] {
  const normalized = topic.toLowerCase().trim().replace(/^\/+/, "");
  const command = helpCommands.find(
    (item) => item.name.toLowerCase().replace(/^\/+/, "") === normalized,
  );
  const key = helpKeys.find((item) => item.name.toLowerCase() === normalized);
  if (command)
    return [
      `${command.name} — ${command.description}`,
      `Syntax: ${command.name}${command.name === "/help" ? " [topic]" : ""}`,
      `Example: ${command.name}`,
      "Related keys: Esc closes this panel",
    ];
  if (key)
    return [`${key.name} — ${key.description}`, "Purpose: keyboard shortcut"];
  if (normalized === "help" || normalized === "permissions")
    return [
      `${normalized} — interactive TUI reference`,
      "Use /help to browse commands and keys.",
    ];
  const candidates = [...helpCommands, ...helpKeys]
    .map((item) => item.name)
    .sort(
      (a, b) =>
        distance(normalizeTopic(a), normalizeTopic(topic)) -
        distance(normalizeTopic(b), normalizeTopic(topic)),
    )
    .slice(0, 3);
  return [
    `unknown topic: '${topic}'`,
    ...candidates.map((candidate) => `  ${candidate}`),
  ];
}

function normalizeTopic(value: string): string {
  return value
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/^ctrl\+/, "ctrl+");
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return row[b.length];
}
