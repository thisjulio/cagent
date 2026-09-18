import { SyntaxStyle, TextAttributes } from "@opentui/core";
import type React from "react";

const syntaxStyle = SyntaxStyle.create();

export function plainLine(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
}

export function Markdown({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  const lines = content.split("\n");
  const children: React.ReactNode[] = [];
  let code: string[] = [];
  let language = "";

  const flushCode = (complete: boolean) => {
    if (!code.length) return;
    children.push(
      <code
        key={`code-${children.length}`}
        content={code.join("\n")}
        filetype={language || undefined}
        syntaxStyle={complete || !streaming ? syntaxStyle : undefined}
        width="100%"
      />,
    );
    code = [];
    language = "";
  };

  for (const [i, line] of lines.entries()) {
    const fence = line.match(/^\s*```(\S*)?\s*$/);
    if (fence) {
      if (code.length) flushCode(true);
      else language = fence[1] ?? "";
      continue;
    }
    if (code.length || language) {
      code.push(line);
      continue;
    }
    const heading = /^#{1,6}\s+/.test(line);
    children.push(
      <text
        key={`line-${i}`}
        attributes={heading ? TextAttributes.BOLD : TextAttributes.NONE}
        content={plainLine(line) || " "}
      />,
    );
  }
  flushCode(false);

  return (
    <box flexDirection="column" width="100%">
      {children}
    </box>
  );
}
