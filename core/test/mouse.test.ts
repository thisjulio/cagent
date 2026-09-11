import { describe, expect, it } from "bun:test";
import { DISABLE_MOUSE, ENABLE_MOUSE, parseMouse } from "../src/ui/mouse";

describe("mouse tracking", () => {
  it("ativa o rastreamento e reconhece roda SGR", () => {
    expect(ENABLE_MOUSE).toContain("?1000h");
    expect(ENABLE_MOUSE).toContain("?1006h");
    expect(DISABLE_MOUSE).toContain("?1000l");
    expect(parseMouse("\x1b[<64;12;8M")?.wheel).toBe("up");
    expect(parseMouse("\x1b[<0;12;8m")?.wheel).toBeNull();
  });
});
