import {
  getHelpCatalog,
  helpDetails,
  helpKeys,
  type HelpItem,
} from "../help-catalog";
import { useTheme } from "../primitives/theme-context";
import { Panel } from "../primitives/Panel";
import { Scrollable } from "../primitives/Scrollable";

export function HelpBox({
  topic = "",
  items = getHelpCatalog(),
}: {
  topic?: string;
  items?: HelpItem[];
}) {
  const { color } = useTheme();
  const details = topic ? helpDetails(topic) : [];
  const groups = [...new Set(items.map((item) => item.group))];
  return (
    <Panel title={topic ? `Help · ${topic}` : "Help"} grow>
      <Scrollable>
        {groups.map((group) => (
          <box key={group} flexDirection="column">
            <text fg={color.accent}>{group}</text>
            {items
              .filter((item) => item.group === group)
              .map((item) => (
                <text key={`${group}:${item.name}`}>
                  <strong>{item.name}</strong> — {item.description}
                  {item.usage ? ` · usage: ${item.usage}` : ""}
                </text>
              ))}
          </box>
        ))}
        <text fg={color.accent}>Keyboard shortcuts</text>
        {helpKeys.map((item) => (
          <text key={item.name}>
            <strong>{item.name}</strong> — {item.description}
          </text>
        ))}
        {details.map((line) => (
          <text key={line}>{line}</text>
        ))}
      </Scrollable>
      <text fg={color.text.muted}>PgUp/PgDn scroll · Esc close</text>
    </Panel>
  );
}
