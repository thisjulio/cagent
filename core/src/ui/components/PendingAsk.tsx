import { Box, Text } from "ink";

export function PendingAsk({ ask }: { ask: { tool: string; cmd: string } }) {
  return (
    <Box flexDirection="column">
      <Text color="yellow">⚠ {ask.tool}: {ask.cmd}</Text>
      <Text color="yellow">permitir?  y = agora · n = negar · a = sempre este comando</Text>
    </Box>
  );
}
