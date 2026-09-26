import { beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Session } from "../src/session/index";
import { toChatItems, toTitle } from "../src/controller/sessions";

describe("JSONL sessions", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "cagent-sess-"));
  });

  it("persists the latest model selection", () => {
    const s = new Session(undefined, dir);
    s.appendModelSelection({ model: "openai/gpt-4", variant: "fast" });
    s.appendModelSelection({ model: "openai/gpt-4o" });

    expect(new Session(s.id, dir).load().modelSelection).toEqual({
      model: "openai/gpt-4o",
    });
  });

  it("removes leaked tool-call markup from generated titles", () => {
    expect(
      toTitle([
        {
          ts: 1,
          type: "meta",
          payload: {
            kind: "title",
            title:
              '<tool_call> {"name": "git_status", "arguments": {}} </tool_call>',
          },
        },
      ]),
    ).toBe("");
  });

  it("append + load roundtrip", () => {
    const s = new Session(undefined, dir);
    s.append({ ts: 1, type: "user", payload: { content: "hi" } });
    s.append({ ts: 2, type: "assistant", payload: { content: "hello" } });
    s.append({
      ts: 3,
      type: "tool",
      payload: {
        tool_call_id: "t1",
        content: "ok",
        toolName: "search",
        summary: "3 matches",
        expanded: false,
      },
    });
    const loaded = new Session(s.id, dir).load();
    expect(loaded.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "tool", tool_call_id: "t1", content: "ok" },
    ]);
    expect(toChatItems(loaded.records).at(-1)).toMatchObject({
      kind: "tool",
      toolName: "search",
      summary: "3 matches",
      expanded: false,
    });
  });

  it("restores explicit tool expansion and derives legacy summaries", () => {
    const records = [
      {
        ts: 1,
        type: "tool" as const,
        payload: {
          toolName: "bash",
          content: "failed output",
          summary: "exit 1",
          expanded: false,
        },
      },
      {
        ts: 2,
        type: "tool" as const,
        payload: {
          toolName: "bash",
          content: "legacy output",
          display: { kind: "terminal" as const, stdout: "", exitCode: 0 },
        },
      },
    ];

    expect(toChatItems(records)).toMatchObject([
      { kind: "tool", summary: "exit 1", expanded: false },
      { kind: "tool", summary: "exit 0" },
    ]);
  });

  it("a new session always has a new id (no auto-resume)", () => {
    const a = new Session("aaa", dir);
    a.append({ ts: 1, type: "user", payload: { content: "x" } });
    const b = new Session("bbb", dir);
    b.append({ ts: 2, type: "user", payload: { content: "y" } });
    const c = new Session(undefined, dir);
    expect(c.id).not.toBe("aaa");
    expect(c.id).not.toBe("bbb");
  });

  it("listing shows the title (metadata) with the first-message fallback", () => {
    const s = new Session("abc", dir);
    s.append({ ts: 1, type: "user", payload: { content: "hello world" } });
    s.append({
      ts: 2,
      type: "meta",
      payload: { kind: "title", title: "My title" },
    });
    const s2 = new Session("xyz", dir);
    s2.append({ ts: 3, type: "user", payload: { content: "hello hello" } });
    const list = Session.list(dir);
    const abc = list.find((x) => x.id === "abc")!;
    const xyz = list.find((x) => x.id === "xyz")!;
    expect(abc.title).toBe("My title");
    expect(xyz.title).toBe("hello hello");
  });

  it("counts user messages past the first 200 session records", () => {
    const session = new Session("long", dir);
    for (let index = 0; index < 205; index++)
      session.append({
        ts: index,
        type: "user",
        payload: { content: `message ${index}` },
      });

    expect(
      Session.list(dir).find((summary) => summary.id === "long")?.messageCount,
    ).toBe(205);
  });

  it("does not list sessions without a user message", () => {
    const empty = new Session("empty", dir);
    empty.appendModelSelection({ model: "openai/gpt-4o" });

    const list = Session.list(dir);

    expect(list).toEqual([]);
  });

  it("finds the latest user message across all sessions", () => {
    const first = new Session("first", dir);
    first.append({
      ts: 10,
      type: "user",
      payload: { content: "older session message" },
    });
    const second = new Session("second", dir);
    second.append({
      ts: 20,
      type: "user",
      payload: { content: "latest global message" },
    });

    expect(Session.latestUserMessage(dir)).toBe("latest global message");
  });

  it("a missing session has empty messages", () => {
    const loaded = new Session("inexistente", dir).load();
    expect(loaded.messages).toEqual([]);
  });

  it("load resumes from the last summary instead of rebuilding old history", () => {
    const s = new Session("compacted", dir);
    s.append({ ts: 1, type: "user", payload: { content: "antiga" } });
    s.append({
      ts: 2,
      type: "assistant",
      payload: { content: "resposta antiga" },
    });
    s.append({
      ts: 3,
      type: "meta",
      payload: { kind: "compacted", summary: "important decision" },
    });
    s.append({ ts: 4, type: "user", payload: { content: "new" } });
    const loaded = new Session(s.id, dir).load();
    expect(loaded.messages).toEqual([
      {
        role: "user",
        content: "[previous conversation summary]\nimportant decision",
      },
      { role: "user", content: "new" },
    ]);
    expect(loaded.records).toHaveLength(2);
  });

  it("restores a typed checkpoint with its recent tail while retaining the full log", () => {
    const s = new Session("typed-checkpoint", dir);
    const tail = [
      { role: "assistant" as const, content: "recent answer" },
      { role: "user" as const, content: "latest question" },
    ];
    s.append({ ts: 1, type: "user", payload: { content: "old history" } });
    s.append({
      ts: 2,
      type: "meta",
      payload: {
        kind: "checkpoint",
        checkpoint: {
          version: 1,
          summary: "## Current state\nWorking",
          recentMessages: tail,
        },
      },
    });

    const loaded = new Session(s.id, dir).load();

    expect(loaded.messages).toEqual([
      {
        role: "user",
        content: "[context checkpoint handoff]\n## Current state\nWorking",
      },
      ...tail,
    ]);
    expect(loaded.records).toHaveLength(1);
    expect(s.load().records[0]?.payload.kind).toBe("checkpoint");
  });

  it("restores activated skills as system messages", () => {
    const s = new Session("skill", dir);
    s.append({
      ts: 1,
      type: "meta",
      payload: {
        kind: "skill-content-v1",
        name: "grill-me",
        source: "user",
        content: "Ask questions.",
      },
    });
    s.append({
      ts: 2,
      type: "user",
      payload: { content: "design clipboard support" },
    });
    const loaded = new Session(s.id, dir).load();

    expect(loaded.messages[0]).toEqual({
      role: "user",
      content: "design clipboard support",
    });
  });
});
