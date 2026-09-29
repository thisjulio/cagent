import { describe, expect, it } from "bun:test";
import { createAssistantSnapshotWriter } from "../src/controller/assistant-snapshot";

describe("assistant snapshot writer", () => {
  it("throttles intermediate writes and flushes the latest snapshot", () => {
    const writes: string[] = [];
    let time = 0;
    const writer = createAssistantSnapshotWriter(
      (content) => writes.push(content),
      1000,
      () => time,
    );

    writer.update("first");
    writer.update("second");
    time = 1000;
    writer.update("third");
    writer.update("final");
    writer.flush();

    expect(writes).toEqual(["first", "third", "final"]);
  });
});
