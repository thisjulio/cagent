import type { UIState } from "../../controller/state";
import { relTime } from "../render/reltime";
import { useTheme } from "../primitives/theme-context";
import { Panel } from "../primitives/Panel";
import { responsiveSize } from "../theme/breakpoints";
import { useTerminalDimensions } from "@opentui/react";

type SessionInfo = NonNullable<UIState["sessionList"]>[number];

export function SessionList({
  list,
  scope,
  query,
  onSelect,
}: {
  list: SessionInfo[];
  scope: "project" | "all";
  query: string;
  onSelect: (id: string) => void;
}) {
  const { color } = useTheme();
  const { width } = useTerminalDimensions();
  const compact = responsiveSize(width) === "compact";
  return (
    <Panel title="Resume session" tone="focused">
      <text fg={color.text.muted}>
        {`scope: ${scope === "project" ? "this project" : "all"} · search: ${
          query || "(none)"
        }`}
      </text>
      <select
        focused
        showDescription={false}
        height={Math.min(12, Math.max(1, list.length))}
        options={list.map((s) => ({
          name: compact
            ? `${s.title} · ${relTime(s.updated)}`
            : `${s.title}  ${relTime(s.updated)}  ${s.messageCount} msgs  ${s.id.slice(0, 8)}`,
          description: "",
          value: s.id,
        }))}
        onSelect={(_, option) => {
          if (option?.value) onSelect(String(option.value));
        }}
      />
      <text fg={color.text.muted}>
        ↑↓ navigate · type: search · Tab scope · Enter resume · Esc cancel
      </text>
    </Panel>
  );
}
