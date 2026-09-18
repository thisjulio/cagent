import { describe, test, expect } from "bun:test";
import { expandCommand } from "../src/expand-command";

describe("expandCommand", () => {
  test("expands PLUGIN_ROOT", () => {
    const result = expandCommand("echo ${PLUGIN_ROOT}", "/tmp/project");
    expect(result).toContain("/plugins/claude-hooks");
    expect(result).not.toContain("${PLUGIN_ROOT}");
  });

  test("expands CWD", () => {
    const result = expandCommand("echo ${CWD}", "/tmp/project");
    expect(result).toBe("echo /tmp/project");
  });

  test("expands HOME", () => {
    const result = expandCommand("echo ${HOME}", "/tmp/project");
    expect(result).toBe(`echo ${process.env.HOME}`);
  });

  test("leaves unknown variables alone", () => {
    const result = expandCommand("echo ${UNKNOWN}", "/tmp/project");
    expect(result).toBe("echo ${UNKNOWN}");
  });

  test("handles multiple expansions", () => {
    const result = expandCommand(
      "echo ${PLUGIN_ROOT} ${CWD} ${HOME}",
      "/tmp/project",
    );
    expect(result).toContain("/plugins/claude-hooks");
    expect(result).toContain("/tmp/project");
    expect(result).toContain(process.env.HOME);
  });
});
