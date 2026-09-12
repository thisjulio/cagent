import type { Controller } from "./controller";
import type { InputKey } from "./state";

// ponytail: orquestração de teclas do input (autocomplete, pickers, pendingAsk) —
// sai do controller para caber no limite de 250 linhas; é uma camada de regras de estado.
export function onKey(c: Controller, key: InputKey, input: string): void {
  const s = c.state;
  if (key.tab) {
    // ponytail: suggestIdx inicia em -1; o 1o tab cai na 1a sugestao (0).
    // inputKey++ sinaliza à UI que o valor foi completado externamente.
    if (s.suggest.length) {
      s.suggestIdx = (s.suggestIdx + 1) % s.suggest.length;
      s.input = s.suggest[s.suggestIdx];
      s.inputKey += 1;
    }
    c.bump();
    return;
  }
  if (s.modelPicker) {
    if (key.escape) s.modelPicker = null;
    else if (input && !/^[1-9]$/.test(input)) s.modelPicker.query += input;
    c.bump();
    return;
  }
  if (s.pendingAsk) {
    if (key.escape) c.answerAsk(false);
    else if (input === "y") c.answerAsk(true);
    else if (input === "n") c.answerAsk(false);
    else if (input === "a") c.allowAlways();
    return;
  }
  if (s.sessionList) {
    if (key.escape) s.sessionList = null;
    c.bump();
    return;
  }
  if (s.helpOpen) {
    if (key.escape || key.return) s.helpOpen = false;
    c.bump();
    return;
  }
  if (key.return) {
    void c.submit(s.input);
    return;
  }
  if (key.ctrl && input === "o") c.toggleToolExpand();
  else if (key.escape) c.interrupt();
}
