import { describe, expect, it } from "bun:test";
import { toolCommandLabel } from "../src/controller/tool-label";

describe("toolCommandLabel", () => {
  it("uses the path from an apply_patch payload when no path argument exists", () => {
    expect(
      toolCommandLabel("edit_file", {
        patch:
          "*** Begin Patch\n*** Update File: core/src/example.ts\n@@\n-old\n+new\n*** End Patch",
      }),
    ).toBe("core/src/example.ts");
  });

  it("prefers the explicit path over a path embedded in the patch", () => {
    expect(
      toolCommandLabel("edit_file", {
        path: "src/explicit.ts",
        patch: "*** Begin Patch\n*** Update File: src/patch.ts\n*** End Patch",
      }),
    ).toBe("src/explicit.ts");
  });

  it("keeps the tool name when a patch has no file path", () => {
    expect(toolCommandLabel("edit_file", { patch: "invalid patch" })).toBe(
      "edit_file",
    );
  });
});
