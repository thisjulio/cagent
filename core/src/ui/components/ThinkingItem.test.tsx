import React from "react";
import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { ThinkingItemComponent } from "./ThinkingItem";

const item = { type: "THINKING" as const, content: "one\ntwo", chatIndex: 0 };

describe("ThinkingItemComponent", () => {
  test("renders reasoning collapsed with its line count", async () => {
    const setup = await testRender(<ThinkingItemComponent item={item} />, {
      width: 60,
      height: 10,
    });
    await act(async () => setup.flush());
    expect(setup.captureCharFrame()).toContain("reasoning · 2 lines");
    expect(setup.captureCharFrame()).not.toContain("one");
    act(() => setup.renderer.destroy());
  });

  test("renders the last line while reasoning is streaming", async () => {
    const setup = await testRender(
      <ThinkingItemComponent item={item} streaming />,
      { width: 60, height: 10 },
    );
    await act(async () => setup.flush());
    expect(setup.captureCharFrame()).toContain("reasoning… two");
    act(() => setup.renderer.destroy());
  });

  test("renders the body when the user expands reasoning", async () => {
    const setup = await testRender(
      <ThinkingItemComponent item={{ ...item, expanded: true }} />,
      { width: 60, height: 10 },
    );
    await act(async () => setup.flush());
    expect(setup.captureCharFrame()).toContain("▾ reasoning");
    expect(setup.captureCharFrame()).toContain("one");
    act(() => setup.renderer.destroy());
  });
});
