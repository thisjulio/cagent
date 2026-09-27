import type { Controller } from "../../controller/controller";
import type { HelpItem } from "../help-catalog";
import { Text } from "../primitives/Text";
import { useTheme } from "../primitives/theme-context";
import { symbols } from "../theme/symbols";
import { Panel } from "../primitives/Panel";

export function CommandPalette({
  controller,
  items,
}: {
  controller: Controller;
  items: HelpItem[];
}) {
  const { color } = useTheme();
  const { commandPaletteQuery: query, commandPaletteIndex: index } =
    controller.state;
  const normalized = query.toLowerCase();
  const matches = items.filter((item) =>
    `${item.name} ${item.description}`.toLowerCase().includes(normalized),
  );
  const selected = matches[index] ?? matches[0];
  const firstVisible = Math.max(0, Math.min(index - 5, matches.length - 12));
  const visible = matches.slice(firstVisible, firstVisible + 12);
  return (
    <Panel title="Command palette" tone="focused">
      <text>Search: {query || "type to filter"} </text>
      {visible.map((item, offset) => {
        const itemIndex = firstVisible + offset;
        return (
          <text
            key={`${item.group}:${item.name}`}
            fg={itemIndex === index ? color.text.primary : color.text.muted}
          >
            {itemIndex === index ? `${symbols.selected} ` : "  "}
            <strong>{item.name}</strong> — {item.description}
          </text>
        );
      })}
      {matches.length === 0 && <Text tone="muted">No matching commands</Text>}
      <Text tone="muted">↑↓ select · Enter run · Esc close</Text>
      {selected && (
        <Text tone="muted">
          {index + 1}/{matches.length} · {selected.name}
        </Text>
      )}
    </Panel>
  );
}
