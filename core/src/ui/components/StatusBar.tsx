import { Box, Text } from "ink";

export function StatusBar({ title, model, tokens, threshold }: { title: string; model: string; tokens: number; threshold: number }) {
  const pct = threshold ? Math.round((tokens / threshold) * 100) : 0;
  return (
    <Box borderTop borderColor="gray">
      <Text dimColor>
        {(title || "nova").slice(0, 30)} | {model} | {tokens} tok · {pct}% do contexto · Esc interrompe · /help
      </Text>
    </Box>
  );
}
