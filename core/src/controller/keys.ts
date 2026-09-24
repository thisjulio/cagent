import type { Controller } from "./controller";
import type { InputKey } from "./state";

// ponytail: input key orchestration (autocomplete, pickers, pendingAsk) lives
// outside the controller to keep it under 500 lines; this is a state-rules layer.

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
  if (s.toolViewerIndex != null) {
    if (key.escape) s.toolViewerIndex = null;
    c.bump();
    return;
  }
  if (s.lspPanel) {
    if (key.escape) s.lspPanel = false;
    c.bump();
    return;
  }
  if (s.infoPanel) {
    if (key.escape) s.infoPanel = null;
    c.bump();
    return;
  }
  if (s.modelPicker) {
    if (key.escape) {
      c.observability?.recordEvent("model_picker.cancelled");
      s.modelPicker = null;
    } else if (key.backspace) {
      s.modelPicker.query = s.modelPicker.query.slice(0, -1);
      c.observability?.recordEvent("model_picker.query_changed", {
        "query.length": s.modelPicker.query.length,
      });
    } else if (input && !/^[1-9]$/.test(input)) {
      s.modelPicker.query += input;
      c.observability?.recordEvent("model_picker.query_changed", {
        "query.length": s.modelPicker.query.length,
      });
    }
    c.bump();
    return;
  }
  if (s.questionRequest) {
    const q = s.questionRequest.questions[s.questionIndex];
    const options = q.options ?? [];
    const hasOther = options.length > 0;
    const isMultiple = q.multiple === true;
    const otherIndex = options.length;
    if (key.escape) {
      if (s.questionOtherMode) {
        s.questionOtherMode = false;
        s.questionTextAnswer = "";
      } else {
        c.questionService.reject(s.questionRequest.id);
      }
    } else if (key.leftArrow && !s.questionOtherMode) {
      if (s.questionIndex > 0) {
        s.questionIndex -= 1;
        s.questionSelectedOption = 0;
        s.questionTextAnswer = s.questionAnswers[s.questionIndex] ?? "";
        s.questionOtherMode = false;
        s.questionSelectedOptions = parseSelectedOptions(
          s.questionAnswers[s.questionIndex] ?? "",
          s.questionRequest.questions[s.questionIndex].options ?? [],
        );
      }
    } else if (key.upArrow) {
      s.questionSelectedOption = Math.max(0, s.questionSelectedOption - 1);
    } else if (key.downArrow) {
      const max = isMultiple
        ? Math.max(0, options.length - 1)
        : hasOther
          ? otherIndex
          : 0;
      s.questionSelectedOption = Math.min(max, s.questionSelectedOption + 1);
    } else if (input === " " && isMultiple && options.length > 0) {
      const selected = s.questionSelectedOptions;
      const index = selected.indexOf(s.questionSelectedOption);
      if (index >= 0) selected.splice(index, 1);
      else selected.push(s.questionSelectedOption);
    } else if (key.return) {
      let answer: string;
      if (isMultiple) {
        answer = s.questionSelectedOptions
          .sort((a, b) => a - b)
          .map((index) => options[index])
          .join(", ");
      } else if (s.questionOtherMode) {
        answer = s.questionTextAnswer;
      } else if (hasOther && s.questionSelectedOption === otherIndex) {
        s.questionOtherMode = true;
        c.bump();
        return;
      } else if (hasOther) {
        answer = options[s.questionSelectedOption];
      } else {
        answer = s.questionTextAnswer;
      }
      s.questionAnswers[s.questionIndex] = answer;
      if (s.questionIndex + 1 < s.questionRequest.questions.length) {
        s.questionIndex += 1;
        s.questionSelectedOption = 0;
        s.questionTextAnswer = s.questionAnswers[s.questionIndex] ?? "";
        s.questionOtherMode = false;
        s.questionSelectedOptions = parseSelectedOptions(
          s.questionAnswers[s.questionIndex] ?? "",
          s.questionRequest.questions[s.questionIndex].options ?? [],
        );
      } else {
        c.questionService.answerCurrent(
          s.questionRequest.id,
          s.questionIndex,
          answer,
          s.questionAnswers,
        );
      }
    } else if (key.backspace && (!hasOther || s.questionOtherMode)) {
      s.questionTextAnswer = s.questionTextAnswer.slice(0, -1);
    } else if (input && (!hasOther || s.questionOtherMode)) {
      s.questionTextAnswer += input;
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
    if (key.escape) {
      c.observability?.recordEvent("help.closed", {
        reason: "escape",
      });
      s.helpOpen = false;
      s.helpTopic = undefined;
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
    if (s.busy) {
      const now = Date.now();
      if (now - s.lastEscTime < DOUBLE_ESC_WINDOW_MS) c.forceCancel();
      else c.interrupt();
      s.lastEscTime = now;
      return;
    }
    if (!s.input.length) return;
    c.setInput("");
    s.inputKey += 1;
    s.lastEscTime = 0;
    c.bump();
  }
}

function parseSelectedOptions(answer: string, options: string[]): number[] {
  const selected = new Set(answer.split(", ").filter(Boolean));
  return options.flatMap((option, index) =>
    selected.has(option) ? [index] : [],
  );
}
