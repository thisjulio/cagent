import { describe, expect, test } from "bun:test";
import type { Controller } from "../src/controller/controller";
import { submitText } from "../src/controller/submit-dispatch";

describe("shell input aliases", () => {
  test("dispatches both $ and ! prefixes to shell", async () => {
    const commands: string[] = [];
    const controller = {
      state: { model: "provider/model", busy: false, input: "", inputKey: 0 },
    } as Controller;
    const actions = {
      submitMessage: async () => {},
      submitShell: async (_controller: Controller, command: string) => {
        commands.push(command);
      },
      submitSubagent: async () => {},
    };

    await submitText(controller, "$ echo one", actions);
    await submitText(controller, "! echo two", actions);

    expect(commands).toEqual(["echo one", "echo two"]);
  });
});
