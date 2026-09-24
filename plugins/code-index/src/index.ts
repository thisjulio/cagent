import type { Plugin } from "@cagent/sdk";
import { createCodeIndex } from "./store";
import { codeIndexTools } from "./tools";

const register: Plugin = (ctx) => {
  const index = createCodeIndex(ctx);
  for (const tool of codeIndexTools(index)) ctx.registerTool(tool);
  ctx.registerContextExtension({
    id: "code-index.repo-map",
    phase: "turn",
    contribute: async ({ tokenBudget }) => {
      const content = await index.repoMap(tokenBudget ?? index.tokenBudget);
      return content ? { content, source: "code-index.repo-map" } : undefined;
    },
  });
  const invalidate = async (payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const file = (payload as { path?: unknown }).path;
    if (typeof file === "string") await index.invalidate(file);
  };
  ctx.on("code-tools/write", invalidate);
  ctx.on("code-tools/edit", invalidate);
};

export default register;
