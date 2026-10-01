import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Session } from "../src/session";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

for (const tail of [
  "",
  '{"broken":',
  JSON.stringify({ text: "é".repeat(5000) }),
  "x".repeat(9000),
]) {
  test(`append repairs tail of ${Buffer.byteLength(tail)} bytes`, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "session-tail-"));
    directories.push(directory);
    const session = new Session(undefined, directory);
    const prefix = `${JSON.stringify({ ts: 1, type: "user", payload: { content: "café" } })}\n`;
    fs.writeFileSync(session.file, prefix + tail);
    session.append({ ts: 2, type: "assistant", payload: { content: "done" } });
    let valid = false;
    try {
      JSON.parse(tail);
      valid = true;
    } catch {}
    const expected = prefix + (valid ? `${tail}\n` : "");
    expect(fs.readFileSync(session.file, "utf8")).toBe(
      expected +
        `${JSON.stringify({ ts: 2, type: "assistant", payload: { content: "done" } })}\n`,
    );
  });
}
