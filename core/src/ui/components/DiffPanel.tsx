import type { ChatItem } from "../../controller/state";
import { ToolDisplayComponent } from "./ToolDisplay";

export function DiffPanel({
  tools,
  index,
}: {
  tools: ChatItem[];
  index: number;
}) {
  const changes = tools.filter(
    (item) => item.kind === "tool" && item.display?.kind === "diff",
  );
  const changedPaths = new Set(
    changes.flatMap((item) =>
      item.display?.kind === "diff"
        ? [item.display.path ?? item.cmd ?? item.toolName ?? "unknown"]
        : [],
    ),
  );
  const selected = changes[index];
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
      <text fg="#d97757">
        File changes · {changedPaths.size}{" "}
        {changedPaths.size === 1 ? "file" : "files"}
        {changes.length ? ` · ${index + 1}/${changes.length}` : ""}
      </text>
      <scrollbox flexGrow={1} flexShrink={1} minHeight={0} height="100%">
        {!selected ? (
          <text>No file changes in this turn</text>
        ) : (
          <box flexDirection="column">
            <text fg="#d97757">
              {selected.display?.kind === "diff"
                ? (selected.display.path ?? selected.cmd ?? selected.toolName)
                : selected.toolName}
            </text>
            {selected.display?.kind === "diff" ? (
              <ToolDisplayComponent display={selected.display} />
            ) : null}
          </box>
        )}
      </scrollbox>
      <text fg="#666666">
        Ctrl+O next earlier · Shift+Ctrl+O previous · Esc close
      </text>
    </box>
  );
}
