import { beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Session } from "../src/session";

describe("JSONL sessions", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "cagent-sess-"));
  });

  it("append + load roundtrip", () => {
    const s = new Session(undefined, dir);
    s.append({ ts: 1, type: "user", payload: { content: "hi" } });
    s.append({ ts: 2, type: "assistant", payload: { content: "hello" } });
    s.append({ ts: 3, type: "tool", payload: { tool_call_id: "t1", content: "ok" } });
    const loaded = new Session(s.id, dir).load();
    expect(loaded.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "tool", tool_call_id: "t1", content: "ok" },
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
    s.append({ ts: 2, type: "meta", payload: { kind: "title", title: "My title" } });
    const s2 = new Session("xyz", dir);
    s2.append({ ts: 3, type: "user", payload: { content: "hello hello" } });
    const list = Session.list(dir);
    const abc = list.find((x) => x.id === "abc")!;
    const xyz = list.find((x) => x.id === "xyz")!;
    expect(abc.title).toBe("My title");
    expect(xyz.title).toBe("hello hello");
  });

  it("a missing session has empty messages", () => {
    const loaded = new Session("inexistente", dir).load();
    expect(loaded.messages).toEqual([]);
  });

  it("load resumes from the last summary instead of rebuilding old history", () => {
    const s = new Session("compacted", dir);
    s.append({ ts: 1, type: "user", payload: { content: "antiga" } });
    s.append({ ts: 2, type: "assistant", payload: { content: "resposta antiga" } });
    s.append({ ts: 3, type: "meta", payload: { kind: "compacted", summary: "important decision" } });
    s.append({ ts: 4, type: "user", payload: { content: "new" } });
    const loaded = new Session(s.id, dir).load();
    expect(loaded.messages).toEqual([
      { role: "user", content: "[previous conversation summary]\nimportant decision" },
      { role: "user", content: "new" },
    ]);
    expect(loaded.records).toHaveLength(2);
  });
});
