import type { UIState } from "../../controller/state";

type SessionInfo = NonNullable<UIState["sessionList"]>[number];

export function SessionList({ list, onSelect }: { list: SessionInfo[]; onSelect: (id: string) => void }) {
  return (
    <box flexDirection="column" flexShrink={0} border borderStyle="rounded" borderColor="#d97757" paddingX={1}>
      <text fg="#d97757"> Resume session </text>
      <text fg="#999999">Select a conversation to restore</text>
      <select
        focused
        height={Math.min(8, Math.max(1, list.length))}
        options={list.map((s) => ({
          name: `${s.id.slice(0, 8)}  ${s.updated.slice(0, 19)}  ${s.title.slice(0, 30)}`,
          description: "",
          value: s.id,
        }))}
        onSelect={(_, option) => { if (option?.value) onSelect(String(option.value)); }}
      />
      <text fg="#666666">↑↓ navigate  Enter resume  Esc cancel</text>
    </box>
  );
}
