import { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { wrap } from "../wrap";
import { H_INPUT_BOX, H_INPUT_BLOCK } from "../mouse";

// ponytail: input multi-linha com viewport. O cursor é estado local (como no
// TextInput, só que com wrap em várias linhas). `offset` controla a janela
// visível (a roda do mouse muda no App); edição que sai da janela auto-rola.
// O bloco externo tem altura fixa (H_INPUT_BLOCK) para o hit-test de região.
export function InputArea({
  input,
  inputKey,
  busy,
  running,
  suggest,
  offset,
  setOffset,
  active,
  onChange,
  onSubmit,
}: {
  input: string;
  inputKey: number;
  busy: boolean;
  running?: string;
  suggest?: string[];
  offset: number;
  setOffset: (n: number) => void;
  active: boolean;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
}) {
  const [cursor, setCursor] = useState(input.length);
  // tab (via inputKey) reposiciona o cursor no fim, como no TextInput original.
  useEffect(() => setCursor(input.length), [inputKey]);
  useEffect(() => {
    if (cursor > input.length) setCursor(input.length);
  }, [input, cursor]);

  const innerW = Math.max(1, process.stdout.columns - 2);
  const lines = wrap(input || "", innerW);
  const vis = Math.max(1, H_INPUT_BOX - 2);
  const maxOff = Math.max(0, lines.length - vis);
  const start = Math.min(Math.max(0, offset), maxOff);
  const shown = lines.slice(start, start + vis);

  // linha visual (após wrap) do cursor em um dado texto/cursor
  function cursorLine(text: string, cur: number): number {
    const ls = wrap(text, innerW);
    for (let i = 0; i < ls.length; i++) if (cur >= ls[i].start && cur < ls[i].end) return i;
    return ls.length - 1;
  }

  const edit = (value: string, cur: number) => {
    setCursor(cur);
    if (value !== input) onChange(value);
    const lineIdx = cursorLine(value, cur);
    if (lineIdx < start) setOffset(lineIdx);
    else if (lineIdx >= start + vis) setOffset(lineIdx - vis + 1);
  };

  useInput(
    (inp, key) => {
      if (key.tab || key.upArrow || key.downArrow || (key.ctrl && inp === "c")) return;
      if (key.return) {
        if (onSubmit) onSubmit(input);
        return;
      }
      if (key.leftArrow) edit(input, Math.max(0, cursor - 1));
      else if (key.rightArrow) edit(input, Math.min(input.length, cursor + 1));
      else if (key.backspace || key.delete) {
        if (cursor > 0) edit(input.slice(0, cursor - 1) + input.slice(cursor), cursor - 1);
        return;
      } else {
        edit(input.slice(0, cursor) + inp + input.slice(cursor), cursor + inp.length);
      }
    },
    { isActive: active },
  );

  function renderLine(line: { text: string; start: number; end: number }): string {
    if (cursor >= line.start && cursor < line.end) {
      const pre = input.slice(line.start, cursor);
      const mid = input[cursor] ?? " ";
      const post = input.slice(cursor + 1, line.end);
      return `${pre}\x1b[7m${mid}\x1b[27m${post}`;
    }
    return line.text;
  }

  return (
    <Box height={H_INPUT_BLOCK} flexDirection="column">
      <Text dimColor>{"─".repeat(Math.max(1, process.stdout.columns - 2))}</Text>
      {busy ? (
        <Text dimColor>
          <Spinner type="dots" /> {running ? `usando ${running}…` : "pensando…"}
        </Text>
      ) : null}
      <Box borderStyle="round" borderColor="cyan" paddingX={1} height={H_INPUT_BOX} flexDirection="column">
        <Text color="cyan">❯ </Text>
        {shown.map((l, i) => (
          <Text key={i}>{renderLine(l)}</Text>
        ))}
      </Box>
      {suggest && suggest.length > 0 ? (
        <Text dimColor>{"  tab: " + suggest.join("  ")}</Text>
      ) : null}
    </Box>
  );
}
