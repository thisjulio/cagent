import { describe, expect, it } from "bun:test";
import {
  READ_ONLY_NOTE,
  runtimeStateMessage,
} from "../src/controller/runtime-state";

describe("runtimeStateMessage", () => {
  it("returns a note in read-only mode", () => {
    expect(runtimeStateMessage("read-only")).toEqual({
      role: "user",
      content: READ_ONLY_NOTE,
    });
  });
  it("returns nothing in ask and auto modes", () => {
    expect(runtimeStateMessage("ask")).toBeUndefined();
    expect(runtimeStateMessage("auto")).toBeUndefined();
  });
});
