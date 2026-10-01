import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { InMemoryObservability, type TurnStatePayload } from "@cagent/sdk";
import { EventBus } from "../src/events";
import { Session } from "../src/session/index";
import type { SessionRecord } from "../src/session/types";
import { runTurnState } from "../src/controller/turn-state";

type Host = {
  bus: EventBus;
  session: Session;
  turnId?: string;
  observability: InMemoryObservability;
};

function makeHost(turnId: string | undefined = "turn-7"): Host {
  const dir = mkdtempSync(path.join(tmpdir(), "cagent-turn-state-"));
  return {
    bus: new EventBus(),
    session: new Session("turn-state", dir),
    turnId,
    observability: new InMemoryObservability(),
  };
}

function turnStateRecords(host: Host): SessionRecord[] {
  return host.session
    .history()
    .filter(
      (record) =>
        record.type === "meta" && record.payload.kind === "turn-state",
    );
}

function appendMetadata(
  payload: TurnStatePayload,
  note: string,
): TurnStatePayload {
  const existing = payload.data.sessionMetadata ?? [];
  return {
    ...payload,
    data: {
      ...payload.data,
      sessionMetadata: [...existing, { note }],
    },
  };
}

describe("turn.state waterfall", () => {
  test("runs handlers in order and appends returned session metadata", () => {
    const host = makeHost();
    const seen: string[] = [];
    host.bus.onWorkflow("turn.state", (payload) => {
      seen.push("first");
      return appendMetadata(payload as TurnStatePayload, "from-first");
    });
    host.bus.onWorkflow("turn.state", (payload) => {
      seen.push("second");
      return appendMetadata(payload as TurnStatePayload, "from-second");
    });

    runTurnState(host, "before");

    expect(seen).toEqual(["first", "second"]);
    const records = turnStateRecords(host);
    expect(records.map((record) => record.payload.note)).toEqual([
      "from-first",
      "from-second",
    ]);
    expect(records.every((record) => record.turnId === "turn-7")).toBe(true);
  });

  test("records the phase and turn identifiers in the payload", () => {
    const host = makeHost();
    const payloads: TurnStatePayload[] = [];
    host.bus.onWorkflow("turn.state", (payload) => {
      payloads.push(payload as TurnStatePayload);
      return payload;
    });

    runTurnState(host, "after");

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.sessionId).toBe(host.session.id);
    expect(payloads[0]?.data.phase).toBe("after");
    expect(payloads[0]?.data.turnId).toBe("turn-7");
  });

  test("plugin handler failure is recorded and does not stop the turn", () => {
    const host = makeHost();
    host.bus.onWorkflow("turn.state", () => {
      throw new Error("plugin exploded");
    });

    expect(() => runTurnState(host, "before")).not.toThrow();

    const events = host.observability.events;
    expect(events.map((event) => event.name)).toEqual(["turn.state.error"]);
    expect(events[0]?.attributes?.error).toContain("plugin exploded");
    expect(events[0]?.attributes?.phase).toBe("before");
    expect(turnStateRecords(host)).toHaveLength(0);
  });

  test("a turn without an identifier emits nothing", () => {
    // Passing undefined to a defaulted parameter re-applies the default.
    const host = { ...makeHost(), turnId: undefined };
    let calls = 0;
    host.bus.onWorkflow("turn.state", (payload) => {
      calls++;
      return payload;
    });

    runTurnState(host, "before");

    expect(calls).toBe(0);
    expect(turnStateRecords(host)).toHaveLength(0);
  });
});
