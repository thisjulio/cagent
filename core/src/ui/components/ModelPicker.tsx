import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

export function ModelPicker({ routes, query, onSelect }: { routes: string[]; query: string; onSelect: (route: string) => void }) {
  return (
    <Box flexDirection="column">
      <Text dimColor>modelo&gt; {query}  (↑↓ · 1-9 · enter · esc)</Text>
      {routes.length === 0 ? <Text dimColor>(nenhum)</Text> : null}
      <SelectInput items={routes.map((r) => ({ label: r, value: r }))} onSelect={(item) => onSelect(item.value)} />
    </Box>
  );
}
