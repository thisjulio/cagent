import { act } from "react";
import { testRender as render } from "@opentui/react/test-utils";

let activeRenderers = 0;

export async function testRender(...args: Parameters<typeof render>) {
  const setup = await render(...args);
  activeRenderers++;
  let active = true;
  const destroy = setup.renderer.destroy.bind(setup.renderer);
  setup.renderer.destroy = () => {
    try {
      destroy();
    } finally {
      if (!active) return;
      active = false;
      activeRenderers--;
      if (activeRenderers > 0)
        Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
    }
  };
  return setup;
}

type UiTestSetup = {
  flush: () => Promise<void>;
  captureCharFrame: () => string;
};

export async function actUntilFrame(
  setup: UiTestSetup,
  action: () => void,
  expected: string,
): Promise<string> {
  let frame = "";
  await act(async () => action());
  for (let attempt = 0; attempt < 40; attempt++) {
    await act(async () => {
      await setup.flush();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    frame = setup.captureCharFrame();
    if (frame.includes(expected)) return frame;
  }
  if (!frame.includes(expected))
    throw new Error(`Timed out waiting for UI frame to contain: ${expected}`);
  return frame;
}
