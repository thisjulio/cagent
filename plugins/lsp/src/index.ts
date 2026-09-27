import type { Plugin } from "@cagent/sdk";
import { lspTool } from "./tool";

const register: Plugin = (ctx) => {
  ctx.registerTool(lspTool(ctx));
  ctx.promptSection(
    "lsp",
    "Use lsp for TypeScript, JavaScript, Biome, Python, and Rust diagnostics, hover, definitions, references, and document symbols. Diagnostics fans out to every matching server (typescript+biome on .ts/.js). Positions are 1-based.",
  );
};

export default register;
