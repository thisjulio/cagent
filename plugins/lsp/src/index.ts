import type { Plugin } from "@cagent/sdk";
import { lspTool } from "./tool";

const register: Plugin = (ctx) => {
  ctx.registerTool(lspTool(ctx));
  ctx.promptSection(
    "lsp",
    "Use lsp for TypeScript, JavaScript, Python, and Rust diagnostics, hover, definitions, references, and document symbols. Positions are 1-based.",
  );
};

export default register;
