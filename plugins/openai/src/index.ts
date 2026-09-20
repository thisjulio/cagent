import type { Plugin } from "@cagent/sdk";
import { CODE_TOOLS_OVERRIDES } from "./overrides";
import { createAdapter } from "./adapter";
import { fetchCodexModelRecords, fetchCodexModels } from "./codex";
import { pkceLogin, persistCreds, readCreds } from "./oauth";

export { createAdapter, fetchCodexModelRecords, fetchCodexModels };

const register: Plugin = (ctx) => {
  const adapter = createAdapter({ config: ctx.config });
  adapter.tool_overrides = () => CODE_TOOLS_OVERRIDES;
  ctx.registerProvider("openai", adapter);
  ctx.registerCommand({
    name: "auth.openai",
    description: "Manage OpenAI authentication",
    subcommands: ["login", "logout", "status"],
    execute: async ({ arguments: action }) => {
      const command = action.trim() || "status";
      if (command === "login") {
        persistCreds(await pkceLogin());
        return "OpenAI authentication completed.";
      }
      if (command === "logout") {
        const creds = readCreds();
        if (!creds) return "OpenAI is not authenticated.";
        persistCreds({ access: "", refresh: "", expires: 0 });
        return "OpenAI authentication removed.";
      }
      if (command === "status") {
        const creds = readCreds();
        return creds?.access && creds.expires > Date.now()
          ? "OpenAI is authenticated with OAuth."
          : "OpenAI is not authenticated with OAuth.";
      }
      return "usage: cagent auth openai [login|logout|status]";
    },
  });
};

export default register;
