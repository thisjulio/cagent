import type { ToolArgs } from "@cagent/sdk";
import { useTheme } from "../primitives/theme-context";
import { Panel } from "../primitives/Panel";
import { symbols } from "../theme/symbols";

function asText(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

export function PendingAsk({
  ask,
}: {
  ask: {
    tool: string;
    cmd: string;
    title?: string;
    args?: ToolArgs;
    canAlwaysAllow?: boolean;
    allowScope?: string;
  };
}) {
  const { color } = useTheme();
  const path = asText(ask.args?.path);
  const command = asText(ask.args?.command);
  const isEdit = ask.tool === "edit_file" || ask.tool === "write_file";
  const isRead = ask.tool === "read_file";
  return (
    <Panel
      title={`${symbols.warning} ${isEdit ? "Approve edit" : "Approve command"}`}
      tone="warning"
    >
      {ask.title ? <text fg={color.text.primary}>{ask.title}</text> : null}
      {isEdit ? (
        <text fg={color.text.secondary}>{path || "file"} · proposed edit</text>
      ) : isRead ? (
        <text fg={color.text.secondary}>{path || "file"} · read requested</text>
      ) : (
        <text fg={color.text.secondary}>$ {command || ask.cmd}</text>
      )}
      <text fg={color.text.primary}>
        y allow · n deny
        {ask.canAlwaysAllow ? ` · a allow ${ask.allowScope ?? "always"}` : ""}
      </text>
      {!ask.canAlwaysAllow && ask.tool === "bash" ? (
        <text fg={color.status.warning}>
          {symbols.warning} Always-allow is unavailable for compound commands
        </text>
      ) : null}
    </Panel>
  );
}
