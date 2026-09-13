import { describe, test, expect, mock } from "bun:test";
import { onKey } from "../src/controller/keys";
import type { Controller } from "../src/controller/controller";

function makeController() {
  return {
    state: {
      busy: false,
      input: "",
      suggest: [],
      suggestIdx: -1,
      inputKey: 0,
      modelPicker: null,
      pendingAsk: null,
      sessionList: null,
      helpOpen: false,
      lastEscTime: 0,
    },
    bump: mock(),
    interrupt: mock(),
    forceCancel: mock(),
    answerAsk: mock(),
    allowAlways: mock(),
    toggleToolExpand: mock(),
    submit: mock(),
    setInput: mock(),
    latestUserMessage: mock(() => null),
  } as unknown as Controller;
}

describe("double-ESC cancellation", () => {
  test("single ESC while idle calls interrupt", () => {
    const c = makeController();
    const base = Date.now();
    Date.now = () => base;
    onKey(c, { escape: true }, "");
    expect(c.interrupt).toHaveBeenCalledTimes(1);
    expect(c.forceCancel).toHaveBeenCalledTimes(0);
  });

  test("double ESC within window while busy calls forceCancel", () => {
    const c = makeController();
    c.state.busy = true;
    const base = Date.now();
    Date.now = () => base;
    onKey(c, { escape: true }, "");
    expect(c.interrupt).toHaveBeenCalledTimes(1);
    expect(c.forceCancel).toHaveBeenCalledTimes(0);

    // Second ESC within 500ms window
    Date.now = () => base + 100;
    onKey(c, { escape: true }, "");
    expect(c.interrupt).toHaveBeenCalledTimes(1);
    expect(c.forceCancel).toHaveBeenCalledTimes(1);
  });

  test("double ESC outside window calls interrupt twice", () => {
    const c = makeController();
    c.state.busy = true;
    const base = Date.now();
    Date.now = () => base;
    onKey(c, { escape: true }, "");
    expect(c.interrupt).toHaveBeenCalledTimes(1);

    // Second ESC after 600ms (outside window)
    Date.now = () => base + 600;
    onKey(c, { escape: true }, "");
    expect(c.interrupt).toHaveBeenCalledTimes(2);
    expect(c.forceCancel).toHaveBeenCalledTimes(0);
  });

  test("double ESC while idle does not forceCancel", () => {
    const c = makeController();
    c.state.busy = false;
    const base = Date.now();
    Date.now = () => base;
    onKey(c, { escape: true }, "");
    Date.now = () => base + 100;
    onKey(c, { escape: true }, "");

    expect(c.interrupt).toHaveBeenCalledTimes(2);
    expect(c.forceCancel).toHaveBeenCalledTimes(0);
  });
});
