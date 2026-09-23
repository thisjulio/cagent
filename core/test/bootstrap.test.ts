import { describe, expect, it } from "bun:test";
import { Registry } from "../src/registry";
import type { ControllerDeps } from "../src/controller/controller";
import { isRouteAvailable, resolveRoute } from "../src/route-resolver";

describe("resolveRoute", () => {
  const adapter = {
    list_models: async () => ["m1", "m2"],
    prepare_call: async (o: unknown) => o,
    stream: async function* () {},
  } as ControllerDeps["adapter"];

  it("validates the provider/model pair against the catalog", async () => {
    const registry = new Registry();
    registry.registerProvider("openai", adapter);
    await expect(
      resolveRoute(
        { model: "openai/m1" } as ControllerDeps["config"],
        registry,
      ),
    ).resolves.toBe("openai/m1");
  });

  it("rejects a provider that does not exist", async () => {
    const registry = new Registry();
    registry.registerProvider("openai", adapter);
    await expect(
      resolveRoute({ model: "foo/m1" } as ControllerDeps["config"], registry),
    ).rejects.toThrow("provider not found: foo");
  });

  it("rejects a model that does not exist in the provider", async () => {
    const registry = new Registry();
    registry.registerProvider("openai", adapter);
    await expect(
      resolveRoute(
        { model: "openai/m9" } as ControllerDeps["config"],
        registry,
      ),
    ).rejects.toThrow("model m9 does not exist in provider openai");
  });

  it("marks a stale persisted route unavailable", async () => {
    const registry = new Registry();
    registry.registerProvider("openai", adapter);

    await expect(isRouteAvailable("openai/m9", registry)).resolves.toBe(false);
    await expect(isRouteAvailable("openai/m1", registry)).resolves.toBe(true);
  });

  it("without config: fallback = first provider + first catalog model", async () => {
    const registry = new Registry();
    registry.registerProvider("openai", adapter);
    await expect(
      resolveRoute({} as ControllerDeps["config"], registry),
    ).resolves.toBe("openai/m1");
  });

  it("without config: keeps the first registered provider when others are available", async () => {
    const registry = new Registry();
    registry.registerProvider("openai", adapter);
    registry.registerProvider("llama.cpp", {
      ...adapter,
      list_models: async () => ["local-model"],
    });
    await expect(
      resolveRoute({} as ControllerDeps["config"], registry),
    ).resolves.toBe("openai/m1");
  });

  it("without config: skips providers that cannot list models", async () => {
    const registry = new Registry();
    registry.registerProvider("unavailable", {
      ...adapter,
      list_models: async () => {
        throw new TypeError("Unable to connect");
      },
    });
    registry.registerProvider("llama.cpp", {
      ...adapter,
      list_models: async () => ["local-model"],
    });

    await expect(
      resolveRoute({} as ControllerDeps["config"], registry),
    ).resolves.toBe("llama.cpp/local-model");
  });
});
