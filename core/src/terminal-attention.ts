export function notifyTerminalAttention(
  title = "cagent — waiting for you",
): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\u0007\u001b]0;${title}\u0007`);
}
