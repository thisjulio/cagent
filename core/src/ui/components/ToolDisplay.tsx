import type { ToolDisplay as Display } from "@cagent/sdk";
import { markdownSyntaxStyle } from "../render/markdown-style";
import { useTheme } from "../primitives/theme-context";

function CodeDisplay({
  display,
}: {
  display: Extract<Display, { kind: "code" }>;
}) {
  const { color } = useTheme();
  const syntaxStyle = markdownSyntaxStyle(color);
  const content = display.content.replace(/\r\n/g, "\n").trimEnd();
  return (
    <box flexDirection="column" width="100%" minWidth={0} overflow="hidden">
      {display.lineNumbers ? (
        <line-number
          minWidth={3}
          paddingRight={1}
          lineNumberOffset={(display.lineStart ?? 1) - 1}
          fg={color.text.muted}
          width="100%"
        >
          <code
            content={content}
            filetype={display.filetype}
            syntaxStyle={syntaxStyle}
            width="100%"
            minWidth={0}
            wrapMode="char"
          />
        </line-number>
      ) : (
        <code
          content={content}
          filetype={display.filetype}
          syntaxStyle={syntaxStyle}
          width="100%"
          minWidth={0}
          wrapMode="char"
        />
      )}
    </box>
  );
}

function DiffDisplay({
  display,
  view,
}: {
  display: Extract<Display, { kind: "diff" }>;
  view: "unified" | "split";
}) {
  const { color } = useTheme();
  const syntaxStyle = markdownSyntaxStyle(color);
  const content = display.content.replace(/\r\n/g, "\n").trimEnd();
  return (
    <box flexDirection="column" width="100%" minWidth={0} overflow="hidden">
      <diff
        diff={content}
        view={view}
        filetype={display.filetype}
        syntaxStyle={syntaxStyle}
        width="100%"
        minWidth={0}
        showLineNumbers
        syncScroll
        wrapMode="none"
      />
    </box>
  );
}

function TerminalDisplay({
  display,
}: {
  display: Extract<Display, { kind: "terminal" }>;
}) {
  const { color } = useTheme();
  return (
    <box flexDirection="column" width="100%" minWidth={0} overflow="hidden">
      <text wrapMode="char">
        <span fg={color.text.secondary}>{display.stdout}</span>
        {display.stderr ? (
          <span fg={color.status.danger}>
            {display.stdout ? "\n" : ""}
            {display.stderr}
          </span>
        ) : null}
      </text>
      {display.timedOut ? (
        <text fg={color.status.warning}>[timed out]</text>
      ) : display.exitCode !== undefined && display.exitCode !== 0 ? (
        <text fg={color.status.danger}>[exit code {display.exitCode}]</text>
      ) : null}
    </box>
  );
}

export function ToolDisplayComponent({
  display,
  view = "unified",
}: {
  display: Display;
  view?: "unified" | "split";
}) {
  if (display.kind === "code") return <CodeDisplay display={display} />;
  if (display.kind === "diff")
    return <DiffDisplay display={display} view={view} />;
  return <TerminalDisplay display={display} />;
}
