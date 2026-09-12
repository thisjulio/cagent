import { useEffect, useState } from "react";
import { TextAttributes, type KeyEvent } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import type { Controller } from "../../controller/controller";
import { filterModels } from "../../fuzzy";
import { ChatViewport } from "./ChatViewport";
import { HelpBox } from "./HelpBox";
import { ModelPicker } from "./ModelPicker";
import { PendingAsk } from "./PendingAsk";
import { SessionList } from "./SessionList";
import { StatusBar } from "./StatusBar";
import { InputArea } from "./InputArea";

export function App({ c }: { c: Controller }) {
  const [, setV] = useState(0);

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

    if (key.name === "tab") {
      c.handleKey({ tab: true }, "\t");
      key.preventDefault();
      return;
    }
    if (key.ctrl && key.name === "o") {
      c.handleKey({ ctrl: true }, "o");
      key.preventDefault();
      return;
    }
    if (key.name === "escape" || (overlay && (s.pendingAsk || s.helpOpen))) {
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
  return (
    <box flexDirection="column" width="100%" height="100%">
      <ChatViewport chat={s.chat} busy={s.busy} controller={c} />
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
        />
      )}
      <box height={1} flexShrink={0}>
        <text attributes={TextAttributes.DIM}>{s.notice}</text>
      </box>
      <StatusBar title={s.title} model={s.model} tokens={s.tokens} contextWindow={s.contextWindow ?? s.threshold} />
    </box>
  );
}

function isPrintable(input: string): boolean {
  return input.length > 0 && !/[\x00-\x1f\x7f]/.test(input) && !input.startsWith("\x1b");
}
