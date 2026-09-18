export type ContextExtensionInput = {
  query: string;
  sessionId?: string;
  projectId?: string;
  tokenBudget?: number;
  signal?: AbortSignal;
};

export type ContextContribution = {
  content: string;
  source: string;
  estimatedTokens?: number;
  untrusted?: boolean;
};

export type ContextExtension = {
  id: string;
  phase: string;
  priority?: number;
  contribute: (
    input: ContextExtensionInput,
  ) => Promise<ContextContribution | void>;
};

export function orderContextExtensions(
  extensions: ContextExtension[],
): ContextExtension[] {
  return [...extensions].sort(
    (left, right) =>
      left.phase.localeCompare(right.phase) ||
      (left.priority ?? 0) - (right.priority ?? 0) ||
      left.id.localeCompare(right.id),
  );
}
