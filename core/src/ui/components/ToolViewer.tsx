import type { ChatItem } from "../../controller/state";
import { ToolDisplayComponent } from "./ToolDisplay";

export function ToolViewer({
  tools,
  index,
}: {
  tools: ChatItem[];
  index: number;
}) {
  const item = tools[index];
  if (!item) return null;
  const display = item.display;
  const body = display?.kind === "terminal" ? display.stdout : item.content;
  return (
    <box
      border
      borderStyle="single"
      borderColor="#666666"
      paddingX={1}
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      minHeight={0}
    >
      <text fg="#d97757">
        {item.toolName} · {item.cmd} · {item.durationMs ?? 0} ms ({index + 1}/
        {tools.length})
      </text>
      <scrollbox flexGrow={1} flexShrink={1} minHeight={0} scrollY>
        {display?.kind === "diff" || display?.kind === "code" ? (
          <ToolDisplayComponent display={display} />
        ) : (
          <text>{body || "No output"}</text>
        )}
      </scrollbox>
      <text fg="#666666">
        Ctrl+O next earlier · Shift+Ctrl+O previous · Esc close
      </text>
    </box>
  );
}
