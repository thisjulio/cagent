import type { ToolArgs } from "@cagent/sdk";

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
  const path = asText(ask.args?.path);
  const command = asText(ask.args?.command);
  const isEdit = ask.tool === "edit_file" || ask.tool === "write_file";
  const isRead = ask.tool === "read_file";
  return (
    <box
      flexDirection="column"
      flexShrink={0}
      border
      borderColor="#eab308"
      paddingX={1}
    >
      <text fg="#eab308">
        <strong>Aprovar {isEdit ? "edição" : "comando"}</strong>
        {ask.title ? ` — ${ask.title}` : ""}
      </text>
      {isEdit ? (
        <text fg="#facc15">{path || "arquivo"} · edição proposta</text>
      ) : isRead ? (
        <text fg="#facc15">{path || "arquivo"} · leitura solicitada</text>
      ) : (
        <text fg="#facc15">$ {command || ask.cmd}</text>
      )}
      <text fg="#a3a3a3">
        y aplicar · n recusar · e recusar com instrução
        {ask.canAlwaysAllow ? ` · a ${ask.allowScope ?? "sempre"}` : ""}
      </text>
      {!ask.canAlwaysAllow && ask.tool === "bash" ? (
        <text fg="#f59e0b">
          ⚠ "sempre" não se aplica a comandos com sintaxe encadeada
        </text>
      ) : null}
    </box>
  );
}
