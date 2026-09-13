import { useEffect, useRef } from "react";
import type { KeyEvent, TextareaRenderable } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { readClipboard } from "../../clipboard/clipboard";
import { ActivitySpinner } from "./ActivitySpinner";

export function InputArea({
  input,
  inputKey,
  busy,
  running,
  suggest,
  active,
  onChange,
  onSubmit,
  onUpArrow,
}: {
  input: string;
  inputKey: number;
  busy: boolean;
  running?: string;
  suggest?: string[];
  active: boolean;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onUpArrow?: () => string | undefined;
}) {
  const textarea = useRef<TextareaRenderable>(null);
  const renderer = useRenderer();

  useEffect(() => {
    const current = textarea.current;
    if (current && current.plainText !== input) {
      current.setText(input);
      current.cursorOffset = input.length;
    }
  }, [input, inputKey]);

  return (
    <box height={7} flexDirection="column" flexShrink={0} border={["top"]} borderColor="#444444" justifyContent="flex-start" paddingX={1}>
      <box height={1}>
        {busy ? <ActivitySpinner label={running ? `prompt · running ${running}` : "prompt · processing"} /> : null}
      </box>
      <box border borderStyle="rounded" borderColor="#d97757" paddingX={1} width="100%" height={4} flexDirection="row">
        <text fg="#d97757" width={2} flexShrink={0}>{"> "}</text>
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
            if (key.ctrl && key.name === "c" && key.shift) {
              const selected = textarea.current?.getSelectedText() ?? "";
              if (selected) renderer.copyToClipboardOSC52(selected);
              return;
            }
            if (key.ctrl && key.name === "v") {
              void paste(textarea.current, key.shift);
              return;
            }
            // ponytail: intercept up before the textarea's binding handler runs;
            // preventDefault stops move-up in the keypress phase, and the
            // keyrelease move-up is a no-op on a single-line empty field.
            if (key.name === "up" && textarea.current?.cursorOffset === 0 && onUpArrow) {
              key.preventDefault();
              const recalled = onUpArrow();
              if (recalled !== undefined && textarea.current) {
                textarea.current.setText(recalled);
                textarea.current.cursorOffset = recalled.length;
              }
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
  if (value !== undefined) {
    textarea.insertText(plain ? value : value);
    textarea.cursorOffset = textarea.plainText.length;
  }
}