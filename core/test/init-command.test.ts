import { describe, expect, test } from "bun:test";
import { runInit } from "../src/commands/init";

describe("runInit", () => {
  test("submits a prompt based on existing project instructions and refreshes context", async () => {
    let submitted = "";
    let refreshed = false;
    const controller = {
      state: { busy: false },
      readOnly: false,
      customCommand: () => undefined,
      submit: async (prompt: string) => {
        submitted = prompt;
      },
      refreshProjectContext: () => {
        refreshed = true;
      },
    };

    await runInit(controller as never, "CI checks");

    expect(submitted).toContain("Mode: update");
    expect(submitted).toContain("Give extra attention to: CI checks");
    expect(refreshed).toBe(true);
  });

  test("does not submit while another turn is running", async () => {
    let submitted = false;
    let refreshed = false;
    const controller = {
      state: { busy: true, chat: [], chatVersion: 0, notice: "" },
      readOnly: false,
      customCommand: () => undefined,
      submit: async () => {
        submitted = true;
      },
      refreshProjectContext: () => {
        refreshed = true;
      },
    };

    await runInit(controller as never, "");

    expect(submitted).toBe(false);
    expect(refreshed).toBe(false);
  });
});
