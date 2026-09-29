import { useEffect, useRef } from "react";
import type { KeyEvent, PasteEvent, TextareaRenderable } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { readClipboard } from "../../clipboard/clipboard";
import { expandChips, pasteAsChips, toggleChip } from "../input-chips";
import { ActivitySpinner } from "./ActivitySpinner";
import { useTheme } from "../primitives/theme-context";

export function InputArea({
  input,
  inputKey,
  busy,
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
  suggest?: string[];
  active: boolean;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onUpArrow?: () => string | undefined;
  onClipboard?: (direction: "paste", length: number, success: boolean) => void;
}) {
  const textarea = useRef<TextareaRenderable>(null);
  const chips = useRef(new Map<string, string>());
  const chipIndex = useRef(0);
  const onClipboardRef = useRef(onClipboard);
  const renderer = useRenderer();
  const { color } = useTheme();
  onClipboardRef.current = onClipboard;
  // ponytail: track last-applied inputKey so setText only runs on external
  // updates (autocomplete, up-arrow, session restore), not on user typing.
  // User typing updates the prop via onChange but doesn't bump inputKey,
  // so the effect skips and the textarea keeps its own cursor state.
  const lastKey = useRef(inputKey);

  useEffect(() => {
    if (inputKey === lastKey.current) return;
    lastKey.current = inputKey;
    chips.current.clear();
    chipIndex.current = 0;
    const current = textarea.current;
    if (!current) return;
    current.setText(input);
    current.cursorOffset = input.length;
  }, [input, inputKey]);

  useEffect(() => {
    const handlePaste = (event: PasteEvent) => {
      if (!active || !textarea.current) return;
      const value = new TextDecoder().decode(event.bytes);
      event.preventDefault();
      insertPaste(textarea.current, value, chips.current, chipIndex);
      onClipboardRef.current?.("paste", value.length, true);
    };
    renderer.keyInput.on("paste", handlePaste);
    return () => {
      renderer.keyInput.off("paste", handlePaste);
    };
  }, [active, renderer]);

  return (
    <box
      height={7}
      flexDirection="column"
      flexShrink={0}
      border={["top"]}
      borderColor={color.border.default}
      justifyContent="flex-start"
      paddingX={1}
    >
      <box height={1}>
        {suggest && suggest.length > 0 ? (
          <text fg={color.text.muted}>{"  Tab: " + suggest.join("  ")}</text>
        ) : busy ? (
          <ActivitySpinner label="prompt · queued while agent is working · Esc interrupt" />
        ) : null}
      </box>
      <box
        border
        borderStyle="rounded"
        borderColor={active ? color.border.focused : color.border.default}
        paddingX={1}
        width="100%"
        height={5}
        flexDirection="row"
      >
        <text fg={color.accent} width={2} flexShrink={0}>
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
            { name: "linefeed", action: "newline" },
            { name: "kpenter", action: "submit" },
            { name: "return", shift: true, action: "newline" },
            { name: "j", ctrl: true, action: "newline" },
          ]}
          onKeyDown={(key: KeyEvent) => {
            const editor = textarea.current;
            if (editor && key.name === "return" && !key.ctrl && !key.shift) {
              const cursor = editor.cursorOffset;
              if (editor.plainText[cursor - 1] === "\\") {
                key.preventDefault();
                editor.setText(
                  `${editor.plainText.slice(0, cursor - 1)}\n${editor.plainText.slice(cursor)}`,
                );
                editor.cursorOffset = cursor;
                return;
              }
            }
            if (editor && key.ctrl && key.name === "e") {
              const changed = toggleChip(
                editor.plainText,
                editor.cursorOffset,
                chips.current,
              );
              if (changed) {
                key.preventDefault();
                editor.setText(changed.text);
                editor.cursorOffset = changed.cursor;
              }
              return;
            }
            if (key.ctrl && key.name === "c" && key.shift) {
              const selected = textarea.current?.getSelectedText() ?? "";
              if (selected) renderer.copyToClipboardOSC52(selected);
              return;
            }
            if (key.ctrl && key.name === "v") {
              void paste(
                textarea.current,
                chips.current,
                chipIndex,
                onClipboard,
              );
              return;
            }
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
          placeholder="type a message · Ctrl+J new line · Ctrl+E expand"
          placeholderColor={color.text.muted}
          onContentChange={() => {
            const value = textarea.current?.plainText ?? "";
            if (value !== input) onChange(value);
          }}
          onSubmit={() => {
            onSubmit(
              expandChips(textarea.current?.plainText ?? input, chips.current),
            );
            chips.current.clear();
            chipIndex.current = 0;
          }}
        />
      </box>
    </box>
  );
}

async function paste(
  textarea: TextareaRenderable | null,
  chips: Map<string, string>,
  chipIndex: { current: number },
  onClipboard?: (direction: "paste", length: number, success: boolean) => void,
): Promise<void> {
  if (!textarea) return;
  const value = await readClipboard();
  onClipboard?.("paste", value?.length ?? 0, value !== undefined);
  if (value !== undefined) insertPaste(textarea, value, chips, chipIndex);
}

function insertPaste(
  textarea: TextareaRenderable,
  value: string,
  chips: Map<string, string>,
  chipIndex: { current: number },
): void {
  const result = pasteAsChips(value, chips, chipIndex.current);
  chipIndex.current = result.nextImageIndex;
  textarea.insertText(result.text);
  textarea.cursorOffset = textarea.plainText.length;
}
