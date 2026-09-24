import type { UIState } from "../../controller/state";
import { relTime } from "../render/reltime";

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
  return (
    <box
      flexDirection="column"
      flexShrink={0}
      border
      borderStyle="rounded"
      borderColor="#d97757"
      paddingX={1}
    >
      <text fg="#d97757"> Resume session </text>
      <text fg="#999999">
        {`scope: ${scope === "project" ? "this project" : "all"} · search: ${
          query || "(none)"
        }`}
      </text>
      <select
        focused
        height={Math.min(8, Math.max(1, list.length))}
        options={list.map((s) => ({
          name: `${s.id.slice(0, 8)}  ${relTime(s.updated)}  ${s.messageCount} msgs  ${s.title}`,
          description: "",
          value: s.id,
        }))}
        onSelect={(_, option) => {
          if (option?.value) onSelect(String(option.value));
        }}
      />
      <text fg="#666666">
        ↑↓ navigate · type: search · Tab scope · Enter resume · Esc cancel
      </text>
    </box>
  );
}
