import { TextAttributes } from "@opentui/core";
import type { QuestionRequest } from "../../controller/question-service";
import { useTheme } from "../primitives/theme-context";
import { Panel } from "../primitives/Panel";
import { symbols } from "../theme/symbols";

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
  const { color } = useTheme();
  const currentIndex = questionIndex;
  const question = request.questions[currentIndex];
  const hasOptions = Boolean(question?.options?.length);
  const isMultiple = question?.multiple === true;
  const progress = `${currentIndex + 1}/${request.questions.length}`;

  return (
    <Panel
      title={`${symbols.warning} ${question.question}${isMultiple ? " (multiple selection)" : ""}`}
      tone="warning"
    >
      {hasOptions && !otherMode ? (
        [...question.options!, ...(isMultiple ? [] : ["Other"])].map(
          (opt, i) => (
            <text
              key={i}
              fg={
                isMultiple && selectedOptions.includes(i)
                  ? color.accent
                  : selectedOption === i
                    ? color.accent
                    : color.text.primary
              }
              attributes={
                selectedOption === i || selectedOptions.includes(i)
                  ? TextAttributes.BOLD
                  : TextAttributes.NONE
              }
            >
              {isMultiple && selectedOptions.includes(i)
                ? `${symbols.taskCompleted} ${opt}`
                : selectedOption === i
                  ? isMultiple
                    ? `${symbols.taskPending} ${opt}`
                    : `${symbols.taskActive} ${opt}`
                  : isMultiple
                    ? `${symbols.taskPending} ${opt}`
                    : "  " + opt}
            </text>
          ),
        )
      ) : (
        <box flexDirection="row">
          <text fg={color.text.muted}>
            {otherMode ? " Other: " : " answer: "}
          </text>
          <text fg={color.text.primary}>{textAnswer}</text>
          {otherMode ? <text fg={color.accent}>▌</text> : null}
        </box>
      )}
      <text fg={color.text.muted}>
        {otherMode
          ? "Type your answer • Enter confirm, Esc back"
          : isMultiple
            ? `Question ${progress} • ↑↓ move, Space toggle, Enter confirm, ← back`
            : `Question ${progress} • ← back, ↑↓ select, Enter confirm, Esc dismiss`}
      </text>
    </Panel>
  );
}
