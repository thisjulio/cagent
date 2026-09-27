import type { ToolDisplay as Display } from "@cagent/sdk";
import { SyntaxStyle } from "@opentui/core";
import { useTheme } from "../primitives/theme-context";

const syntaxStyle = SyntaxStyle.create();
const DISPLAY_MAX_LINES = 12;

function visibleLines(content: string, maximum: number): string[] {
  const normalized = content.replace(/\r\n/g, "\n").trimEnd();
  if (!normalized) return [];
  return normalized.split("\n").slice(0, maximum);
}

export function previewContent(content: string, maximum: number): string {
  return visibleLines(content, maximum).join("\n");
}

function CodeDisplay({
  display,
  maxRows,
}: {
  display: Extract<Display, { kind: "code" }>;
  maxRows?: number;
}) {
  const { color } = useTheme();
  const content = previewContent(display.content, maxRows ?? DISPLAY_MAX_LINES);
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
            wrapMode="none"
          />
        </line-number>
      ) : (
        <code
          content={content}
          filetype={display.filetype}
          syntaxStyle={syntaxStyle}
          width="100%"
          minWidth={0}
          wrapMode="none"
        />
      )}
    </box>
  );
}

function DiffDisplay({
  display,
  view,
  maxRows,
}: {
  display: Extract<Display, { kind: "diff" }>;
  view: "unified" | "split";
  maxRows?: number;
}) {
  const { color } = useTheme();
  const allLines = display.content.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const firstHunk = allLines.findIndex((line) => line.startsWith("@@ "));
  const headerRows = Math.min(firstHunk < 0 ? allLines.length : firstHunk, 3);
  const visibleHunkRows =
    maxRows === undefined ? undefined : maxRows - headerRows;
  const shown =
    maxRows === undefined
      ? allLines
      : [
          ...allLines.slice(0, headerRows),
          ...allLines.slice(
            headerRows,
            headerRows + Math.max(0, visibleHunkRows ?? 0),
          ),
        ];
  const content = shown.join("\n");
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
      {shown.length < allLines.length ? (
        <text fg={color.text.muted}>
          … {allLines.length - shown.length} more lines · /diff
        </text>
      ) : null}
    </box>
  );
}

function TerminalDisplay({
  display,
  maxRows,
}: {
  display: Extract<Display, { kind: "terminal" }>;
  maxRows?: number;
}) {
  const { color } = useTheme();
  const maximum = maxRows ?? DISPLAY_MAX_LINES;
  const output = `${display.stdout}${display.stderr ? `\n${display.stderr}` : ""}`;
  const allLines = output.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const lines =
    display.exitCode !== undefined && display.exitCode !== 0
      ? allLines.slice(-maximum)
      : allLines.slice(0, maximum);
  const stdout = visibleLines(display.stdout, maximum);
  return (
    <box flexDirection="column" width="100%" minWidth={0} overflow="hidden">
      <box flexDirection="column">
        {lines.map((line, index) => (
          <text
            key={`terminal-${index}`}
            fg={
              index < stdout.length ? color.text.secondary : color.status.danger
            }
          >
            {line}
          </text>
        ))}
        {display.timedOut ? (
          <text fg={color.status.warning}>[timed out]</text>
        ) : display.exitCode !== undefined && display.exitCode !== 0 ? (
          <text fg={color.status.danger}>[exit code {display.exitCode}]</text>
        ) : null}
      </box>
    </box>
  );
}

export function ToolDisplayComponent({
  display,
  view = "unified",
  maxRows,
}: {
  display: Display;
  view?: "unified" | "split";
  maxRows?: number;
}) {
  if (display.kind === "code")
    return <CodeDisplay display={display} maxRows={maxRows} />;
  if (display.kind === "diff")
    return <DiffDisplay display={display} view={view} maxRows={maxRows} />;
  return <TerminalDisplay display={display} maxRows={maxRows} />;
}
