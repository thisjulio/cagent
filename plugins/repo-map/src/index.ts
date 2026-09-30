import path from "node:path";
import type { Plugin } from "@cagent/sdk";
import { buildIndex } from "./indexer";
import { rank, render } from "./map";

const register: Plugin = async (ctx) => {
  const warn = (message: string) =>
    ctx.diagnostics.report({
      level: "warn",
      code: "REPO_MAP",
      message,
    });
  const root =
    typeof ctx.config.root === "string"
      ? path.resolve(ctx.config.root)
      : process.cwd();
  const configured = ctx.config.tokens;
  const tokens =
    typeof configured === "number" && Number.isFinite(configured)
      ? Math.max(0, Math.min(2000, Math.floor(configured)))
      : 1000;
  try {
    // Prepare before registration: stable contributions must not cache an empty cold index.
    const files = rank(
      await buildIndex({
        root,
        cacheDirectory: ctx.storage.path("index"),
        warn,
      }),
    );
    ctx.registerContextExtension({
      id: "repo-map",
      phase: "stable",
      priority: 50,
      contribute: async (input) => {
        if (input.signal?.aborted) return;
        const budget = Math.min(tokens, input.tokenBudget ?? tokens);
        const content = render(
          files,
          Number.isFinite(budget) ? budget : tokens,
        );
        if (!content) return;
        return {
          content,
          source: "repo-map",
          estimatedTokens: Math.ceil(content.length / 4),
          untrusted: true,
        };
      },
    });
  } catch (error) {
    warn(`Repository map unavailable: ${String(error)}`);
  }
};

export default register;
