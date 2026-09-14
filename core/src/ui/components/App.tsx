import { useEffect, useState } from "react";
import { TextAttributes, type KeyEvent } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { Controller } from "../../controller/controller";
import { filterModels } from "../../fuzzy";
import { ChatViewport } from "./ChatViewport";
import { HelpBox } from "./HelpBox";
import { ModelPicker } from "./ModelPicker";
import { PendingAsk } from "./PendingAsk";
import { SessionList } from "./SessionList";
import { StatusBar } from "./StatusBar";
import { InputArea } from "./InputArea";
import { TaskPanel } from "./TaskPanel";
import { formatHeaderTitle } from "../render/title";

export function App({ c }: { c: Controller }) {
  const [, setV] = useState(0);
  const renderer = useRenderer();

  useEffect(() => {
    c.bump = () => setV((v) => v + 1);
    return () => {
      c.bump = () => {};
    };
  }, [c]);

  useKeyboard((key: KeyEvent) => {
    const s = c.state;
    const input = key.sequence || (key.name === "space" ? " " : "");
    const overlay = s.helpOpen || s.modelPicker || s.sessionList || s.pendingAsk;

    if (key.ctrl && key.name === "c" && !key.shift && !overlay) {
      c.observability?.recordEvent("keyboard.ctrl_c", { busy: s.busy, cleared_input: s.input.length > 0 });
      if (s.input.length > 0) {
        c.setInput("");
        s.inputKey += 1;
      } else {
        renderer.destroy();
        process.exit(0);
      }
      key.preventDefault();
      return;
    }
    if (key.ctrl && key.shift && key.name === "c" && renderer.hasSelection) {
      const selected = renderer.getSelection()?.getSelectedText() ?? "";
      c.observability?.recordEvent("clipboard.copy", { "text.length": selected.length, success: Boolean(selected) });
      if (selected) renderer.copyToClipboardOSC52(selected);
      key.preventDefault();
      return;
    }
    if (key.name === "tab") {
      c.handleKey({ tab: true }, "\t");
      key.preventDefault();
      return;
    }
    if (key.ctrl && key.name === "o") {
      c.observability?.recordEvent("tool_output.toggled");
      c.handleKey({ ctrl: true }, "o");
      key.preventDefault();
      return;
    }
    if (key.name === "escape" || (overlay && (s.pendingAsk || s.helpOpen))) {
      c.observability?.recordEvent("keyboard.escape", { busy: s.busy, overlay: Boolean(overlay) });
      c.handleKey({ escape: key.name === "escape", return: key.name === "enter" }, input);
      key.preventDefault();
      return;
    }
    if (s.pendingAsk) {
      c.handleKey({}, input);
      key.preventDefault();
      return;
    }
    if (s.modelPicker && isPrintable(input) && !key.ctrl && !key.meta) {
      c.handleKey({}, input);
    }
  });
  const s = c.state;
  const lastLog = s.toolLog[s.toolLog.length - 1];
  const running = lastLog?.running ? lastLog.tool : undefined;
  const overlay = s.helpOpen || s.modelPicker || s.sessionList || s.pendingAsk;
  const status = s.compacting ? "compacting" : s.pendingAsk ? "permission" : s.busy ? "working" : "ready";
  return (
    <box flexDirection="column" width="100%" height="100%">
      <box
        height={1}
        flexShrink={0}
        paddingX={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <text fg="#d97757">{formatHeaderTitle(s.title, terminalWidth())}</text>
        <text fg={s.busy ? "#d97757" : "#777777"}>{s.busy ? "working" : status}</text>
      </box>
      <ChatViewport chat={s.chat} busy={s.busy} controller={c} />
      <TaskPanel tasks={s.tasks} />
      {s.helpOpen ? (
        <HelpBox />
      ) : s.modelPicker ? (
        <ModelPicker
          routes={filterModels(s.modelPicker.entries, s.modelPicker.query)}
          query={s.modelPicker.query}
          onSelect={(r) => c.pickModel(r)}
        />
      ) : s.sessionList ? (
        <SessionList list={s.sessionList} onSelect={(id) => c.resumeSession(id)} />
      ) : s.pendingAsk ? (
        <PendingAsk ask={s.pendingAsk} />
      ) : (
        <InputArea
          input={s.input}
          inputKey={s.inputKey}
          busy={s.busy}
          running={running}
          suggest={s.suggest}
          active={!overlay}
          onChange={(v) => c.setInput(v)}
          onSubmit={(v) => c.submit(v)}
          onClipboard={(_, length, success) => c.observability?.recordEvent("clipboard.paste", { "text.length": length, success })}
          onUpArrow={() => {
            c.handleKey({ upArrow: true }, "");
            return c.state.input || undefined;
          }}
        />
      )}
      <box height={1} flexShrink={0}>
        <text attributes={TextAttributes.DIM}>{s.notice}</text>
      </box>
      <StatusBar model={s.model} tokens={s.tokens} contextWindow={s.contextWindow ?? s.threshold} />
    </box>
  );
}

function terminalWidth(): number {
  return Number.isFinite(process.stdout.columns) && process.stdout.columns > 0 ? process.stdout.columns : 80;
}

function isPrintable(input: string): boolean {
  return input.length > 0 && !/[\x00-\x1f\x7f]/.test(input) && !input.startsWith("\x1b");
}