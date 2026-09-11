import React from "react";
import { Text } from "ink";
import ReactMarkdown from "react-markdown";
import { HighlightedCode, decodeHtml } from "./highlight";

type MDProps = { children?: unknown; inline?: boolean; className?: string; number?: number; alt?: string };

const MD_COMPONENTS = {
  code: ({ inline, className, children }: MDProps) => {
    const code = decodeHtml(String(children ?? "")).replace(/\n$/, "");
    if (inline) return <Text color="yellow">{code}</Text>;
    const language = (className ?? "").replace("language-", "").trim();
    return <HighlightedCode code={code} language={language || undefined} />;
  },
  a: ({ children }: MDProps) => <Text color="cyan" underline>{children}</Text>,
  strong: ({ children }: MDProps) => <Text bold>{children}</Text>,
  em: ({ children }: MDProps) => <Text italic>{children}</Text>,
  del: ({ children }: MDProps) => <Text dimColor>{children}</Text>,
  h1: ({ children }: MDProps) => <Text bold>{children}</Text>,
  h2: ({ children }: MDProps) => <Text bold>{children}</Text>,
  h3: ({ children }: MDProps) => <Text bold>{children}</Text>,
  ul: ({ children }: MDProps) => <Text>{children}</Text>,
  // ponytail: children do ol vem como ["\n", <li>, "\n", <li>, ...] — filtra elementos antes do cloneElement
  ol: ({ children }: MDProps) => (
    <Text>
      {React.Children.toArray(children)
        .filter((c) => React.isValidElement(c))
        .map((child, i) =>
          React.cloneElement(child as React.ReactElement<Record<string, unknown>>, { number: i + 1 })
        )}
    </Text>
  ),
  li: ({ children, number }: MDProps) => (
    <Text>{number ? `  ${number}. ` : "  • "}{children}</Text>
  ),
  blockquote: ({ children }: MDProps) => <Text dimColor>{"  "}{children}</Text>,
  p: ({ children }: MDProps) => <Text>{children}</Text>,
  pre: ({ children }: MDProps) => <Text>{children}</Text>,
  br: () => <Text>{"\n"}</Text>,
  img: ({ alt }: MDProps) => <Text dimColor>{`[imagem: ${alt ?? ""}]`}</Text>,
};

export function Markdown({ content }: { content: string }) {
  return (
    <Text>
      <ReactMarkdown components={MD_COMPONENTS}>{content}</ReactMarkdown>
    </Text>
  );
}
