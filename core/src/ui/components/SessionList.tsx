import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
import type { UIState } from "../../controller/state";

type SessionInfo = NonNullable<UIState["sessionList"]>[number];

export function SessionList({ list, onSelect }: { list: SessionInfo[]; onSelect: (id: string) => void }) {
  return (
    <Box flexDirection="column">
      <Text dimColor>sessões  (↑↓ · enter · esc)</Text>
      <SelectInput
        items={list.map((s) => ({
          key: s.id,
          label: `${s.id.slice(0, 8)}  ${s.updated.slice(0, 19)}  ${s.title.slice(0, 30)}`,
          value: s.id,
        }))}
        onSelect={(item) => onSelect(item.value)}
      />
    </Box>
  );
}
