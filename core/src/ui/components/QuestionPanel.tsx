import { TextAttributes } from "@opentui/core";
import type { QuestionRequest } from "../../controller/question-service";

interface QuestionPanelProps {
  request: QuestionRequest;
  selectedOption?: number;
  textAnswer?: string;
  otherMode?: boolean;
  questionIndex?: number;
  selectedOptions?: number[];
}

export function QuestionPanel({
  request,
  selectedOption = 0,
  textAnswer = "",
  otherMode = false,
  questionIndex = 0,
  selectedOptions = [],
}: QuestionPanelProps) {
  const currentIndex = questionIndex;
  const question = request.questions[currentIndex];
  const hasOptions = Boolean(question?.options?.length);
  const isMultiple = question?.multiple === true;
  const progress = `${currentIndex + 1}/${request.questions.length}`;

  return (
    <box flexDirection="column" flexShrink={0}>
      <text fg="#d97757">
        ? {question.question}
        {isMultiple ? " (multiple selection)" : ""}
      </text>
      {hasOptions && !otherMode ? (
        [...question.options!, ...(isMultiple ? [] : ["Other"])].map(
          (opt, i) => (
            <text
              key={i}
              fg={
                isMultiple && selectedOptions.includes(i)
                  ? "#d97757"
                  : selectedOption === i
                    ? "#d97757"
                    : "#cccccc"
              }
              attributes={
                selectedOption === i || selectedOptions.includes(i)
                  ? TextAttributes.BOLD
                  : TextAttributes.NONE
              }
            >
              {isMultiple && selectedOptions.includes(i)
                ? "☑ " + opt
                : selectedOption === i
                  ? isMultiple
                    ? "☐ " + opt
                    : "▶ " + opt
                  : isMultiple
                    ? "☐ " + opt
                    : "  " + opt}
            </text>
          ),
        )
      ) : (
        <box flexDirection="row">
          <text fg="#777777">{otherMode ? " Other: " : " answer: "}</text>
          <text fg="#cccccc">{textAnswer}</text>
          {otherMode ? <text fg="#d97757">▌</text> : null}
        </box>
      )}
      <text fg="#666666">
        {otherMode
          ? "Type your answer • Enter confirm, Esc back"
          : isMultiple
            ? `Question ${progress} • ↑↓ move, Space toggle, Enter confirm, ← back`
            : `Question ${progress} • ← back, ↑↓ select, Enter confirm, Esc dismiss`}
      </text>
    </box>
  );
}
