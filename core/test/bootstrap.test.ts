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

  it("valida o par provider/modelo contra o catálogo", async () => {
    const registry = new Registry();
    registry.registerProvider("openai", adapter);
    await expect(resolveRoute({ model: "openai/m1" } as ControllerDeps["config"], registry)).resolves.toBe("openai/m1");
  });

  it("rejeita provedor que não existe", async () => {
    const registry = new Registry();
    registry.registerProvider("openai", adapter);
    await expect(resolveRoute({ model: "foo/m1" } as ControllerDeps["config"], registry)).rejects.toThrow("provedor não encontrado: foo");
  });

  it("rejeita modelo que não existe no provedor", async () => {
    const registry = new Registry();
    registry.registerProvider("openai", adapter);
    await expect(resolveRoute({ model: "openai/m9" } as ControllerDeps["config"], registry)).rejects.toThrow("modelo m9 não existe no provedor openai");
  });

  it("sem config: fallback = 1º provedor + 1º modelo do catálogo", async () => {
    const registry = new Registry();
    registry.registerProvider("openai", adapter);
    await expect(resolveRoute({} as ControllerDeps["config"], registry)).resolves.toBe("openai/m1");
  });
});
