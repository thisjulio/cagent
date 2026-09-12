import { useEffect, useRef } from "react";
import type { KeyEvent, TextareaRenderable } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { readClipboard } from "../../clipboard/clipboard";

export function InputArea({
  input,
  inputKey,
  busy,
  running,
  suggest,
  active,
  onChange,
  onSubmit,
}: {
  input: string;
  inputKey: number;
  busy: boolean;
  running?: string;
  suggest?: string[];
  active: boolean;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}) {
  const textarea = useRef<TextareaRenderable>(null);
  const renderer = useRenderer();

  useEffect(() => {
    const current = textarea.current;
    if (current && current.plainText !== input) current.setText(input);
  }, [input, inputKey]);

  return (
    <box height={7} flexDirection="column" flexShrink={0} border={["top"]} borderColor="#666666" justifyContent="flex-start">
      <text height={1} fg="#666666">{busy ? `... ${running ? `running ${running}` : "thinking"}` : ""}</text>
      <box border borderStyle="single" borderColor="cyan" paddingX={1} width="100%" height={4} flexDirection="row">
        <text fg="cyan" width={2} flexShrink={0}>{"> "}</text>
        <textarea
          ref={textarea}
          initialValue={input}
          focused={active}
          flexGrow={1}
          height={2}
          wrapMode="word"
          keyBindings={[
            { name: "return", action: "submit" },
            { name: "linefeed", action: "submit" },
            { name: "kpenter", action: "submit" },
            { name: "return", shift: true, action: "newline" },
          ]}
          onKeyDown={(key: KeyEvent) => {
            if (key.ctrl && key.name === "c" && !key.shift) {
              textarea.current?.setText("");
              onChange("");
              return;
            }
            if (key.ctrl && key.name === "c" && key.shift) {
              const selected = textarea.current?.getSelectedText() ?? "";
              if (selected) renderer.copyToClipboardOSC52(selected);
              return;
            }
            if (key.ctrl && key.name === "v") {
              void paste(textarea.current, key.shift);
            }
          }}
          placeholder="type your next instruction"
          placeholderColor="#666666"
          onContentChange={() => {
            const value = textarea.current?.plainText ?? "";
            if (value !== input) onChange(value);
          }}
          onSubmit={() => onSubmit(textarea.current?.plainText ?? input)}
        />
      </box>
      {suggest && suggest.length > 0 ? (
        <text fg="#666666">{"  tab: " + suggest.join("  ")}</text>
      ) : null}
    </box>
  );
}

async function paste(textarea: TextareaRenderable | null, plain: boolean): Promise<void> {
  if (!textarea) return;
  const value = await readClipboard();
  if (value !== undefined) textarea.insertText(plain ? value : value);
}
