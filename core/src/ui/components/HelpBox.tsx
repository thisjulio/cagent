import {
  getHelpCatalog,
  helpDetails,
  helpKeys,
  type HelpItem,
} from "../help-catalog";

export function HelpBox({
  topic = "",
  items = getHelpCatalog(),
}: {
  topic?: string;
  items?: HelpItem[];
}) {
  const details = topic ? helpDetails(topic) : [];
  const groups = [...new Set(items.map((item) => item.group))];
  return (
    <box
      border
      borderStyle="single"
      borderColor="#666666"
      paddingX={1}
      flexDirection="column"
      height="100%"
      minHeight={0}
      flexShrink={0}
    >
      <scrollbox flexGrow={1} flexShrink={1}>
        {groups.map((group) => (
          <box key={group} flexDirection="column">
            <text fg="#d97757">{group}</text>
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
        <text fg="#d97757">Keyboard shortcuts</text>
        {helpKeys.map((item) => (
          <text key={item.name}>
            <strong>{item.name}</strong> — {item.description}
          </text>
        ))}
        {details.map((line) => (
          <text key={line}>{line}</text>
        ))}
      </scrollbox>
      <text fg="#666666">↑↓ scroll · Esc close · Ctrl+P palette</text>
    </box>
  );
}
