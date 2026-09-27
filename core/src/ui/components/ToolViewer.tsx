import type { ChatItem } from "../../controller/state";
import { ToolDisplayComponent } from "./ToolDisplay";
import { Panel } from "../primitives/Panel";
import { useTheme } from "../primitives/theme-context";

export function ToolViewer({
  tools,
  index,
}: {
  tools: ChatItem[];
  index: number;
}) {
  const { color } = useTheme();
  const item = tools[index];
  if (!item) return null;
  const display = item.display;
  const body = display?.kind === "terminal" ? display.stdout : item.content;
  return (
    <box flexGrow={1} flexShrink={1} minHeight={0}>
      <Panel
        title={`${item.toolName} · ${item.cmd} · ${item.durationMs ?? 0} ms (${index + 1}/${tools.length})`}
        footer={
          <text fg={color.text.muted}>
            Ctrl+O next earlier · Shift+Ctrl+O previous · Esc close
          </text>
        }
      >
        <scrollbox flexGrow={1} flexShrink={1} minHeight={0} scrollY>
          {display?.kind === "diff" || display?.kind === "code" ? (
            <ToolDisplayComponent display={display} />
          ) : (
            <text>{body || "No output"}</text>
          )}
        </scrollbox>
      </Panel>
    </box>
  );
}
