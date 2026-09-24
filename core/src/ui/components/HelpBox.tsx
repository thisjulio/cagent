import { helpCommands, helpDetails, helpKeys } from "../help-catalog";

export function HelpBox({ topic = "" }: { topic?: string }) {
  const details = topic ? helpDetails(topic) : [];
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
        <text fg="#d97757">Commands</text>
        {helpCommands.map((item) => (
          <text key={item.name}>
            <strong>{item.name}</strong> — {item.description}
          </text>
        ))}
        <text fg="#d97757">Keys</text>
        {helpKeys.map((item) => (
          <text key={item.name}>
            <strong>{item.name}</strong> — {item.description}
          </text>
        ))}
        {details.map((line) => (
          <text key={line}>{line}</text>
        ))}
      </scrollbox>
      <text fg="#666666">↑↓ scroll · Esc close</text>
    </box>
  );
}
