import React, { useEffect, useState } from "react";
import { Box, Static, Text, useInput } from "ink";
import type { Controller } from "../../controller/controller";
import type { InputKey } from "../../controller/state";
import { filterModels } from "../../fuzzy";
import { ChatItemRow } from "./ChatItemRow";
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
    const onResize = () => c.bump();
    process.stdout.on("resize", onResize);
    return () => process.stdout.off("resize", onResize);
  }, [c]);
  useInput((input, key) => c.handleKey(key as InputKey, input));
  const s = c.state;
  const last = s.chat.length - 1;
  const lastLog = s.toolLog[s.toolLog.length - 1];
  const running = lastLog?.running ? lastLog.tool : undefined;
  return (
    <Box flexDirection="column">
      <Box flexDirection="column">
        <Static items={s.chat.slice(0, last)} style={{ width: process.stdout.columns }}>
          {(it, i) => <ChatItemRow it={it} streaming={false} key={`c${i}`} />}
        </Static>
        {s.chat.length > 0 ? <ChatItemRow it={s.chat[last]} streaming={s.busy} /> : null}
        {s.helpOpen ? <HelpBox /> : null}
        {s.modelPicker ? (
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
          <InputArea input={s.input} inputKey={s.inputKey} busy={s.busy} running={running} suggest={s.suggest} onChange={(v) => c.setInput(v)} onSubmit={(v) => c.submit(v)} />
        )}
        {s.notice ? <Text dimColor>{s.notice}</Text> : null}
      </Box>
      <StatusBar title={s.title} model={s.model} tokens={s.tokens} threshold={s.threshold} />
    </Box>
  );
}
