import type { Plugin } from "@cagent/sdk";
import { CODE_TOOLS_OVERRIDES } from "./overrides";
import { createAdapter } from "./adapter";
import { fetchCodexModelRecords, fetchCodexModels } from "./codex";

export { createAdapter, fetchCodexModelRecords, fetchCodexModels };

const register: Plugin = (ctx) => {
  const adapter = createAdapter({ config: ctx.config });
  adapter.tool_overrides = () => CODE_TOOLS_OVERRIDES;
  ctx.registerProvider("openai", adapter);
};

export default register;
