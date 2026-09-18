import { getGitInfo, formatCwd, formatGitBadge } from "../../gitinfo";

export function ProjectContext({ cwd }: { cwd: string }) {
  const git = getGitInfo(cwd);
  const cwdLabel = `📁 ${formatCwd(cwd)}`;
  const gitBadge = formatGitBadge(git);

  return (
    <box
      border={["top"]}
      borderColor="#444444"
      flexShrink={0}
      flexDirection="row"
      justifyContent="space-between"
      paddingX={1}
    >
      <text fg="#66cdaa">{cwdLabel}</text>
      <text fg="#d97757">{gitBadge}</text>
    </box>
  );
}
