import { defineTool } from "@cagent/sdk";
import type { QuestionService } from "./question-service";

export function createQuestionTool(questionService: QuestionService) {
  return defineTool(
    "question",
    "Ask the user questions and wait for their answers before continuing. Use when you need clarification, decisions, or input from the user. Supports free-text, single-choice, and multiple-choice questions.",
    {
      type: "object",
      properties: {
        questions: {
          type: "array",
          description: "List of questions to ask the user",
          items: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description: "The question text",
              },
              options: {
                type: "array",
                description:
                  "Optional list of choices. If omitted, user types free text.",
                items: { type: "string" },
              },
              multiple: {
                type: "boolean",
                description:
                  "When true, the user can select multiple options. Requires options.",
              },
            },
            required: ["question"],
          },
        },
      },
      required: ["questions"],
    },
    async (args) => {
      const questions = args.questions as Array<{
        question: string;
        options?: string[];
        multiple?: boolean;
      }>;

      try {
        const answers = await questionService.ask(questions);
        const formatted = answers
          .map((a) => `"${a.question}"="${a.answer}"`)
          .join(", ");
        return {
          output: `User has answered your questions: ${formatted}. You can now continue with the user's answers in mind.`,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          output: `User dismissed the question: ${msg}`,
          isError: true,
        };
      }
    },
  );
}
