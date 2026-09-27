import type { ChatItem } from "../../controller/state";
import { useTerminalDimensions } from "@opentui/react";
import { ToolDisplayComponent } from "./ToolDisplay";
import { diffViewForWidth } from "../render/diff-view";
import { useTheme } from "../primitives/theme-context";
import { Panel } from "../primitives/Panel";
import { Scrollable } from "../primitives/Scrollable";

export function DiffPanel({
  tools,
  index,
}: {
  tools: ChatItem[];
  index: number;
}) {
  const dimensions = useTerminalDimensions();
  const { color } = useTheme();
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
    <Panel
      grow
      title={`File changes · ${changedPaths.size} ${changedPaths.size === 1 ? "file" : "files"}${changes.length ? ` · ${index + 1}/${changes.length}` : ""}`}
      footer={
        <text fg={color.text.muted}>
          Ctrl+O next earlier · Shift+Ctrl+O previous · Esc close
        </text>
      }
    >
      <Scrollable>
        {!selected ? (
          <text>No file changes in this turn</text>
        ) : (
          <box flexDirection="column">
            <text fg={color.accent}>
              {selected.display?.kind === "diff"
                ? (selected.display.path ?? selected.cmd ?? selected.toolName)
                : selected.toolName}
            </text>
            {selected.display?.kind === "diff" ? (
              <ToolDisplayComponent
                display={selected.display}
                view={diffViewForWidth(dimensions.width)}
              />
            ) : null}
          </box>
        )}
      </Scrollable>
    </Panel>
  );
}
