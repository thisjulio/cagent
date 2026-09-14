import { describe, expect, it } from "bun:test";
import { Registry } from "../src/registry";
import type { ControllerDeps } from "../src/controller/controller";
import { resolveRoute } from "../src/bootstrap";

describe("resolveRoute", () => {
  const adapter = {
    list_models: async () => ["m1", "m2"],
    prepare_call: async (o: unknown) => o,
    stream: async function* () {},
  } as ControllerDeps["adapter"];

  it("validates the provider/model pair against the catalog", async () => {
    const registry = new Registry();
    registry.registerProvider("openai", adapter);
    await expect(resolveRoute({ model: "openai/m1" } as ControllerDeps["config"], registry)).resolves.toBe("openai/m1");
  });

  it("rejects a provider that does not exist", async () => {
    const registry = new Registry();
    registry.registerProvider("openai", adapter);
    await expect(resolveRoute({ model: "foo/m1" } as ControllerDeps["config"], registry)).rejects.toThrow("provider not found: foo");
  });

  it("rejects a model that does not exist in the provider", async () => {
    const registry = new Registry();
    registry.registerProvider("openai", adapter);
    await expect(resolveRoute({ model: "openai/m9" } as ControllerDeps["config"], registry)).rejects.toThrow("model m9 does not exist in provider openai");
  });

  it("without config: fallback = first provider + first catalog model", async () => {
    const registry = new Registry();
    registry.registerProvider("openai", adapter);
    await expect(resolveRoute({} as ControllerDeps["config"], registry)).resolves.toBe("openai/m1");
  });

  it("without config: keeps the first registered provider when others are available", async () => {
    const registry = new Registry();
    registry.registerProvider("openai", adapter);
    registry.registerProvider("llama.cpp", {
      ...adapter,
      list_models: async () => ["local-model"],
    });
    await expect(resolveRoute({} as ControllerDeps["config"], registry)).resolves.toBe("openai/m1");
  });
});
