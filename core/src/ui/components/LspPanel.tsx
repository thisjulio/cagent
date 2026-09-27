import type { LspServer } from "../../lsp/doctor";
import { useTheme } from "../primitives/theme-context";
import { Status } from "../primitives/Status";
import { Panel } from "../primitives/Panel";
import { Scrollable } from "../primitives/Scrollable";

export function LspPanel({ servers }: { servers: LspServer[] }) {
  const { color } = useTheme();
  return (
    <box flexGrow={1} flexShrink={1} minHeight={0}>
      <Panel title="LSP doctor" grow>
        <Scrollable>
          {servers.map((server) => (
            <box key={server.language} flexDirection="column" marginBottom={1}>
              <box flexDirection="row">
                <Status
                  state={server.status === "missing" ? "error" : "success"}
                  label={`${server.language} · ${server.status}`}
                />
                <text fg={color.text.secondary}> {server.binary}</text>
                {server.version ? (
                  <text fg={color.text.muted}> · {server.version}</text>
                ) : null}
              </box>
              {server.status === "missing" ? (
                <text fg={color.text.secondary}>
                  {"  → "}
                  {server.language === "rs"
                    ? "Install via rustup or your OS package manager"
                    : `Install ${server.binary} using its official instructions`}
                </text>
              ) : null}
            </box>
          ))}
        </Scrollable>
        <text fg={color.text.muted}>
          Esc close · follow the server's official installation instructions
        </text>
      </Panel>
    </box>
  );
}
