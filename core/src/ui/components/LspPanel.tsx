import type { LspServer } from "../../lsp/doctor";

export function LspPanel({ servers }: { servers: LspServer[] }) {
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
      <text fg="#d97757">LSP doctor</text>
      <text>Language | Server | Status | Version | Fix</text>
      <scrollbox flexGrow={1} flexShrink={1} minHeight={0}>
        {servers.map((server) => (
          <text key={server.language}>
            {server.language} | {server.binary} | {server.status} |{" "}
            {server.version} |{" "}
            {server.status === "missing" ? "Install with npm" : "-"}
          </text>
        ))}
      </scrollbox>
      <text fg="#666666">
        Esc close · install prompt is available for missing servers
      </text>
    </box>
  );
}
