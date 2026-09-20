import { randomUUID } from "node:crypto";

export interface QuestionInfo {
  question: string;
  options?: string[];
  multiple?: boolean;
}

export interface QuestionRequest {
  id: string;
  questions: QuestionInfo[];
  createdAt: Date;
}

export interface QuestionAnswer {
  question: string;
  answer: string;
}

interface PendingEntry {
  request: QuestionRequest;
  resolve: (answers: QuestionAnswer[]) => void;
  reject: (reason: unknown) => void;
}

export class QuestionService {
  private pending = new Map<string, PendingEntry>();
  private listeners = new Set<() => void>();

  ask(questions: QuestionInfo[]): Promise<QuestionAnswer[]> {
    const id = randomUUID();
    const request: QuestionRequest = {
      id,
      questions,
      createdAt: new Date(),
    };

    return new Promise<QuestionAnswer[]>((resolve, reject) => {
      this.pending.set(id, { request, resolve, reject });
      this.notify();
    });
  }

  answerCurrent(
    requestId: string,
    questionIndex: number,
    answer: string,
    previousAnswers: string[] = [],
  ): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    const answers = entry.request.questions.map((question, index) => ({
      question: question.question,
      answer: index === questionIndex ? answer : (previousAnswers[index] ?? ""),
    }));
    this.pending.delete(requestId);
    entry.resolve(answers);
    this.notify();
    return true;
  }

  selectOption(requestId: string, optionIndex: number): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    const q = entry.request.questions[0];
    const answer = q.options?.[optionIndex];
    if (!answer) return false;
    this.pending.delete(requestId);
    entry.resolve([{ question: q.question, answer }]);
    this.notify();
    return true;
  }

  submitText(requestId: string, text: string): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    const q = entry.request.questions[0];
    this.pending.delete(requestId);
    entry.resolve([{ question: q.question, answer: text }]);
    this.notify();
    return true;
  }

  reply(requestId: string, answers: QuestionAnswer[]): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    this.pending.delete(requestId);
    entry.resolve(answers);
    this.notify();
    return true;
  }

  reject(requestId: string): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    this.pending.delete(requestId);
    entry.reject(new Error("user dismissed question"));
    this.notify();
    return true;
  }

  list(): QuestionRequest[] {
    return [...this.pending.values()].map((e) => e.request);
  }

  hasPending(): boolean {
    return this.pending.size > 0;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}
