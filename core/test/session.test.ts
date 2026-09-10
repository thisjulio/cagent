import { beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Session } from "../src/session";

describe("sessões JSONL", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "cagent-sess-"));
  });

  it("append + load roundtrip", () => {
    const s = new Session(undefined, dir);
    s.append({ ts: 1, type: "user", payload: { content: "oi" } });
    s.append({ ts: 2, type: "assistant", payload: { content: "olá" } });
    s.append({ ts: 3, type: "tool", payload: { tool_call_id: "t1", content: "ok" } });
    const loaded = new Session(s.id, dir).load();
    expect(loaded.messages).toEqual([
      { role: "user", content: "oi" },
      { role: "assistant", content: "olá" },
      { role: "tool", tool_call_id: "t1", content: "ok" },
    ]);
  });

  it("auto-resume pega a sessão mais recente", () => {
    const a = new Session("aaa", dir);
    a.append({ ts: 1, type: "user", payload: { content: "x" } });
    const b = new Session("bbb", dir);
    b.append({ ts: 2, type: "user", payload: { content: "y" } });
    expect(new Session(undefined, dir).id).toBe("bbb");
  });

  it("listagem mostra preview da primeira mensagem", () => {
    const s = new Session("abc", dir);
    s.append({ ts: 1, type: "user", payload: { content: "hello world" } });
    const list = Session.list(dir);
    expect(list[0].id).toBe("abc");
    expect(list[0].preview).toContain("hello");
  });

  it("sessão inexistente tem mensagens vazias", () => {
    const loaded = new Session("inexistente", dir).load();
    expect(loaded.messages).toEqual([]);
  });
});
