import { useEffect, useState } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import type { Controller } from "../../controller/controller";
import type { InputKey } from "../../controller/state";
import { filterModels } from "../../fuzzy";
import { regionAt, parseMouse, isMouseInput, ENABLE_MOUSE, DISABLE_MOUSE } from "../mouse";
import { ChatViewport } from "./ChatViewport";
import { HelpBox } from "./HelpBox";
import { ModelPicker } from "./ModelPicker";
import { PendingAsk } from "./PendingAsk";
import { SessionList } from "./SessionList";
import { StatusBar } from "./StatusBar";
import { InputArea } from "./InputArea";

export function App({ c }: { c: Controller }) {
  const [, setV] = useState(0);
  const [chatOffset, setChatOffset] = useState(0);
  const [inputOffset, setInputOffset] = useState(0);
  const { internal_eventEmitter } = useStdin();

  useEffect(() => {
    c.bump = () => setV((v) => v + 1);
    const onResize = () => c.bump();
    process.stdout.on("resize", onResize);
    // habilita mouse tracking; disable no teardown (terminais sem suporte ignoram)
    process.stdout.write(ENABLE_MOUSE);
    const onInput = (data: string) => {
      const m = parseMouse(data);
      if (!m || !m.wheel) return;
      const region = regionAt(m.y);
      if (!region) return;
      if (region === "chat") {
        setChatOffset((o) => Math.max(0, o + (m.wheel === "up" ? 1 : -1)));
      } else if (region === "input") {
        setInputOffset((o) => Math.max(0, o + (m.wheel === "up" ? 1 : -1)));
      }
    };
    internal_eventEmitter.on("input", onInput);
    return () => {
      internal_eventEmitter.off("input", onInput);
      process.stdout.off("resize", onResize);
      process.stdout.write(DISABLE_MOUSE);
    };
  }, [c, internal_eventEmitter]);

  useInput((input, key) => {
    if (isMouseInput(input)) return;
    if (key.return && !c.state.helpOpen && !c.state.busy) {
      // InputArea handles normal submits; slash commands are routed here too,
      // because Ink can deliver Enter before the child hook after a rerender.
      void c.submit(c.state.input);
      return;
    }
    c.handleKey(key as InputKey, input);
  });
  const s = c.state;
  const lastLog = s.toolLog[s.toolLog.length - 1];
  const running = lastLog?.running ? lastLog.tool : undefined;
  const overlay = s.helpOpen || s.modelPicker || s.sessionList || s.pendingAsk;
  return (
    <Box flexDirection="column">
      <ChatViewport chat={s.chat} offset={chatOffset} busy={s.busy} />
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
          offset={inputOffset}
          setOffset={setInputOffset}
          active={!overlay}
          onChange={(v) => c.setInput(v)}
          onSubmit={(v) => c.submit(v)}
        />
      )}
      {/* linha reservada para notice (altura fixa para o hit-test) */}
      <Box height={1}>
        {s.notice ? <Text dimColor>{s.notice}</Text> : null}
      </Box>
      <StatusBar title={s.title} model={s.model} tokens={s.tokens} threshold={s.threshold} />
    </Box>
  );
}
