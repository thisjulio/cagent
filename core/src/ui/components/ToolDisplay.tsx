import type { ToolDisplay as Display } from "@cagent/sdk";
import { SyntaxStyle } from "@opentui/core";

const syntaxStyle = SyntaxStyle.create();
const DISPLAY_MAX_LINES = 12;
const DIFF_MAX_LINES = 14;

function visibleLines(content: string, maximum: number): string[] {
  const normalized = content.replace(/\r\n/g, "\n").trimEnd();
  if (!normalized) return [];
  const lines = normalized.split("\n");
  return lines.slice(0, maximum);
}

export function previewContent(content: string, maximum: number): string {
  return visibleLines(content, maximum).join("\n");
}

function CodeDisplay({
  display,
}: {
  display: Extract<Display, { kind: "code" }>;
}) {
  const content = previewContent(display.content, DISPLAY_MAX_LINES);
  return (
    <box flexDirection="column" width="100%" minWidth={0} overflow="hidden">
      {display.lineNumbers ? (
        <line-number
          minWidth={3}
          paddingRight={1}
          lineNumberOffset={(display.lineStart ?? 1) - 1}
          fg="#6b7280"
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
}: {
  display: Extract<Display, { kind: "diff" }>;
}) {
  return (
    <box flexDirection="column" width="100%" minWidth={0} overflow="hidden">
      <diff
        diff={display.content}
        view="split"
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
  const stdout = visibleLines(display.stdout, DISPLAY_MAX_LINES);
  const stderr = visibleLines(display.stderr ?? "", DISPLAY_MAX_LINES);
  const lines = [...stdout, ...stderr].slice(0, DISPLAY_MAX_LINES);
  return (
    <box flexDirection="column" width="100%" minWidth={0} overflow="hidden">
      <box flexDirection="column">
        {lines.length > 0
          ? lines.map((line, index) => (
              <text
                key={`terminal-${index}`}
                fg={index < stdout.length ? "#c9d1d9" : "#f87171"}
              >
                {line}
              </text>
            ))
          : null}
        {display.timedOut ? (
          <text fg="#eab308">[timed out]</text>
        ) : display.exitCode !== undefined && display.exitCode !== 0 ? (
          <text fg="#f87171">[exit code {display.exitCode}]</text>
        ) : null}
      </box>
    </box>
  );
}

export function ToolDisplayComponent({ display }: { display: Display }) {
  if (display.kind === "code") return <CodeDisplay display={display} />;
  if (display.kind === "diff") return <DiffDisplay display={display} />;
  return <TerminalDisplay display={display} />;
}
