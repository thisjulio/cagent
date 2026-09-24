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
  activityLabel,
  suggest,
  active,
  onChange,
  onSubmit,
  onUpArrow,
  onClipboard,
}: {
  input: string;
  inputKey: number;
  busy: boolean;
  running?: string;
  activityLabel?: string;
  suggest?: string[];
  active: boolean;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onUpArrow?: () => string | undefined;
  onClipboard?: (direction: "paste", length: number, success: boolean) => void;
}) {
  const textarea = useRef<TextareaRenderable>(null);
  const renderer = useRenderer();
  // ponytail: track last-applied inputKey so setText only runs on external
  // updates (autocomplete, up-arrow, session restore), not on user typing.
  // User typing updates the prop via onChange but doesn't bump inputKey,
  // so the effect skips and the textarea keeps its own cursor state.
  const lastKey = useRef(inputKey);

  useEffect(() => {
    if (inputKey === lastKey.current) return;
    lastKey.current = inputKey;
    const current = textarea.current;
    if (!current) return;
    current.setText(input);
    current.cursorOffset = input.length;
  }, [input, inputKey]);

  return (
    <box
      height={7}
      flexDirection="column"
      flexShrink={0}
      border={["top"]}
      borderColor="#444444"
      justifyContent="flex-start"
      paddingX={1}
    >
      <box height={1}>
        {suggest && suggest.length > 0 ? (
          <text fg="#666666">{"  tab: " + suggest.join("  ")}</text>
        ) : busy ? (
          <ActivitySpinner
            label={
              activityLabel ??
              (running
                ? `prompt · running ${running}`
                : "prompt · queued while agent is working")
            }
          />
        ) : null}
      </box>
      <box
        border
        borderStyle="rounded"
        borderColor="#d97757"
        paddingX={1}
        width="100%"
        height={5}
        flexDirection="row"
      >
        <text fg="#d97757" width={2} flexShrink={0}>
          {"> "}
        </text>
        <textarea
          ref={textarea}
          initialValue={input}
          focused={active}
          flexGrow={1}
          height={3}
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
              void paste(textarea.current, key.shift, onClipboard);
              return;
            }
            const editor = textarea.current;
            if (editor && key.ctrl && key.name === "u") {
              key.preventDefault();
              editor.deleteToLineStart();
            } else if (editor && key.ctrl && key.name === "w") {
              key.preventDefault();
              editor.deleteWordBackward();
            } else if (editor && key.ctrl && key.name === "a") {
              key.preventDefault();
              editor.gotoLineStart();
            } else if (editor && key.ctrl && key.name === "e") {
              key.preventDefault();
              editor.gotoLineTextEnd();
            } else if (editor && key.ctrl && key.name === "left") {
              key.preventDefault();
              editor.moveWordBackward();
            } else if (editor && key.ctrl && key.name === "right") {
              key.preventDefault();
              editor.moveWordForward();
            } else if (editor && key.name === "home") {
              key.preventDefault();
              editor.gotoLineStart();
            } else if (editor && key.name === "end") {
              key.preventDefault();
              editor.gotoLineTextEnd();
            }
            // ponytail: intercept up before the textarea's binding handler runs;
            // preventDefault stops move-up in the keypress phase, and the
            // keyrelease move-up is a no-op on a single-line empty field.
            if (
              key.name === "up" &&
              textarea.current?.cursorOffset === 0 &&
              onUpArrow
            ) {
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
    </box>
  );
}

async function paste(
  textarea: TextareaRenderable | null,
  plain: boolean,
  onClipboard?: (direction: "paste", length: number, success: boolean) => void,
): Promise<void> {
  if (!textarea) return;
  const value = await readClipboard();
  onClipboard?.("paste", value?.length ?? 0, value !== undefined);
  if (value !== undefined) {
    textarea.insertText(value.replace(/\r\n?|\n/g, " "));
    textarea.cursorOffset = textarea.plainText.length;
  }
}
