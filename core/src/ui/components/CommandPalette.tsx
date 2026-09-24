import type { Controller } from "../../controller/controller";
import type { HelpItem } from "../help-catalog";

export function CommandPalette({
  controller,
  items,
}: {
  controller: Controller;
  items: HelpItem[];
}) {
  const { commandPaletteQuery: query, commandPaletteIndex: index } =
    controller.state;
  const normalized = query.toLowerCase();
  const matches = items.filter((item) =>
    `${item.name} ${item.description}`.toLowerCase().includes(normalized),
  );
  const selected = matches[index] ?? matches[0];
  return (
    <box border borderStyle="double" paddingX={1} flexDirection="column">
      <text fg="#d97757">Command palette</text>
      <text>Search: {query || "type to filter"} </text>
      {matches.slice(0, 12).map((item, itemIndex) => (
        <text
          key={`${item.group}:${item.name}`}
          fg={itemIndex === index ? "#ffffff" : "#888888"}
        >
          {itemIndex === index ? "› " : "  "}
          <strong>{item.name}</strong> — {item.description}
        </text>
      ))}
      {matches.length === 0 && <text fg="#888888">No matching commands</text>}
      <text fg="#666666">↑↓ select · Enter run · Esc close · Ctrl+P close</text>
      {selected && <text fg="#666666">Selected: {selected.name}</text>}
    </box>
  );
}
