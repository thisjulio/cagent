import type { UIState } from "./state";

export function compactionEventFields(
  state: UIState,
  model: string,
): Record<string, unknown> {
  return {
    "state.tokens": state.tokens,
    "context.window": state.contextWindow,
    threshold: state.threshold,
    model,
  };
}
