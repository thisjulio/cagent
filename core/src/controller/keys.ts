import type { Controller } from "./controller";
import type { InputKey } from "./state";

// ponytail: input key orchestration (autocomplete, pickers, pendingAsk) lives
// outside the controller to keep it under 250 lines; this is a state-rules layer.

// ponytail: double-ESC within this window forces cancellation of running tools.
const DOUBLE_ESC_WINDOW_MS = 500;

export function onKey(c: Controller, key: InputKey, input: string): void {
  const s = c.state;
  if (key.tab) {
    // ponytail: suggestIdx starts at -1; the first tab selects suggestion 0.
    // inputKey++ tells the UI that the value was completed externally.
    if (s.suggest.length) {
      s.suggestIdx = (s.suggestIdx + 1) % s.suggest.length;
      s.input = s.suggest[s.suggestIdx];
      s.inputKey += 1;
      c.observability?.recordEvent("autocomplete.accepted", {
        "suggestion.index": s.suggestIdx,
        "suggestion.count": s.suggest.length,
      });
    }
    c.bump();
    return;
  }
  const memory = s.chat?.findLast((item) => item.kind === "memory" && item.memoryStatus === "pending");
  if (memory && key.return) {
    c.toggleMemoryDetails();
    return;
  }
  if (memory && input && ["a", "e", "i"].includes(input)) {
    void c.reviewMemory(memory.memoryId ?? "", input === "a" ? "approve" : input === "i" ? "ignore" : "edit");
    return;
  }
  if (s.modelPicker) {
    if (key.escape) {
      c.observability?.recordEvent("model_picker.cancelled");
      s.modelPicker = null;
    }
    else if (input && !/^[1-9]$/.test(input)) {
      s.modelPicker.query += input;
      c.observability?.recordEvent("model_picker.query_changed", { "query.length": s.modelPicker.query.length });
    }
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
    if (key.escape) {
      c.observability?.recordEvent("session_picker.cancelled");
      s.sessionList = null;
    }
    c.bump();
    return;
  }
  if (s.helpOpen) {
    if (key.escape || key.return) {
      c.observability?.recordEvent("help.closed", { reason: key.escape ? "escape" : "return" });
      s.helpOpen = false;
    }
    c.bump();
    return;
  }
  if (key.upArrow) {
    // ponytail: up reuses the last sent message only while the input is empty;
    // with text the textarea keeps its normal cursor movement.
    if (!s.input) {
      const last = c.latestUserMessage();
      if (last) {
        s.input = last;
        s.inputKey += 1;
      }
    }
    c.bump();
    return;
  }
  if (key.return) {
    void c.submit(s.input);
    return;
  }
  if (key.ctrl && input === "o") {
    c.toggleToolExpand();
  } else if (key.escape) {
    // Double-ESC while busy forces cancellation of running tools.
    const now = Date.now();
    if (s.busy && now - s.lastEscTime < DOUBLE_ESC_WINDOW_MS) {
      c.forceCancel();
    } else {
      c.interrupt();
    }
    s.lastEscTime = now;
  }
}
