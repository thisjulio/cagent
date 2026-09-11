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

  it("nova sessão sempre tem id novo (sem auto-resume)", () => {
    const a = new Session("aaa", dir);
    a.append({ ts: 1, type: "user", payload: { content: "x" } });
    const b = new Session("bbb", dir);
    b.append({ ts: 2, type: "user", payload: { content: "y" } });
    const c = new Session(undefined, dir);
    expect(c.id).not.toBe("aaa");
    expect(c.id).not.toBe("bbb");
  });

  it("listagem mostra o título (meta) com fallback da 1ª mensagem", () => {
    const s = new Session("abc", dir);
    s.append({ ts: 1, type: "user", payload: { content: "hello world" } });
    s.append({ ts: 2, type: "meta", payload: { kind: "title", title: "Meu título" } });
    const s2 = new Session("xyz", dir);
    s2.append({ ts: 3, type: "user", payload: { content: "oi oi" } });
    const list = Session.list(dir);
    const abc = list.find((x) => x.id === "abc")!;
    const xyz = list.find((x) => x.id === "xyz")!;
    expect(abc.title).toBe("Meu título");
    expect(xyz.title).toBe("oi oi");
  });

  it("sessão inexistente tem mensagens vazias", () => {
    const loaded = new Session("inexistente", dir).load();
    expect(loaded.messages).toEqual([]);
  });
});
