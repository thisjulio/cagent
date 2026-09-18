import type { Message } from "@cagent/sdk";

export type RetentionClass =
  | "essential"
  | "temporary"
  | "retrievable"
  | "obsolete";

export type ContextTurn = {
  id: string;
  messages: Message[];
  retention: RetentionClass;
};

export type ContextReference = {
  id: string;
  turnId?: string;
  retention: RetentionClass;
  source: "system" | "checkpoint" | "turn";
};

export type ContextManifest = {
  included: ContextReference[];
  omitted: ContextReference[];
  slidingWindowTurnIds: string[];
  essentialTurnIds: string[];
  retrievedTurnIds: string[];
};

export type AssembledContext = {
  messages: Message[];
  manifest: ContextManifest;
  omitted: ContextReference[];
};

export type ContextAssemblyInput = {
  system: Message;
  checkpoint?: string;
  turns: ContextTurn[];
  retrieved?: ContextTurn[];
  recentTurnCount: number;
};

export function turnsFromMessages(messages: Message[]): ContextTurn[] {
  const turns: ContextTurn[] = [];
  let current: ContextTurn | undefined;
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user" || !current) {
      current = {
        id: `message-turn-${turns.length + 1}`,
        messages: [],
        retention: "retrievable",
      };
      turns.push(current);
    }
    current.messages.push(message);
  }
  return turns;
}

export function assembleContext(input: ContextAssemblyInput): AssembledContext {
  const recent = input.turns.slice(-Math.max(0, input.recentTurnCount));
  const selected = uniqueTurns([
    ...input.turns.filter((turn) => turn.retention === "essential"),
    ...recent,
    ...(input.retrieved ?? []),
  ]);
  const selectedIds = new Set(selected.map((turn) => turn.id));
  const omitted = input.turns
    .filter(
      (turn) => !selectedIds.has(turn.id) && turn.retention !== "obsolete",
    )
    .map(turnReference);
  const included: ContextReference[] = [
    { id: "system", retention: "essential", source: "system" },
    ...(input.checkpoint
      ? [
          {
            id: "checkpoint",
            retention: "essential" as const,
            source: "checkpoint" as const,
          },
        ]
      : []),
    ...selected.map(turnReference),
  ];
  const messages: Message[] = [input.system];
  if (input.checkpoint) {
    messages.push({
      role: "user",
      content: `[context checkpoint]\n${input.checkpoint}`,
    });
  }
  for (const turn of selected) messages.push(...turn.messages);
  return {
    messages,
    manifest: {
      included,
      omitted,
      slidingWindowTurnIds: recent.map((turn) => turn.id),
      essentialTurnIds: input.turns
        .filter((turn) => turn.retention === "essential")
        .map((turn) => turn.id),
      retrievedTurnIds: (input.retrieved ?? []).map((turn) => turn.id),
    },
    omitted,
  };
}

function uniqueTurns(turns: ContextTurn[]): ContextTurn[] {
  const seen = new Set<string>();
  return turns.filter((turn) => {
    if (seen.has(turn.id)) return false;
    seen.add(turn.id);
    return turn.retention !== "obsolete";
  });
}

function turnReference(turn: ContextTurn): ContextReference {
  return {
    id: `turn:${turn.id}`,
    turnId: turn.id,
    retention: turn.retention,
    source: "turn",
  };
}
