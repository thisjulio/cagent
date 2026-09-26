import type { Plugin } from "@cagent/sdk";
import { createAdapter } from "./adapter";
import { pkceLogin, persistCreds, readCreds } from "./oauth";

const register: Plugin = (ctx) => {
  const adapter = createAdapter({
    config: ctx.config,
    observability: ctx.observability,
  });
  ctx.registerProvider("anthropic", adapter);
  ctx.registerCommand({
    name: "auth.anthropic",
    description: "Manage Anthropic authentication",
    subcommands: ["login", "logout", "status"],
    execute: async ({ arguments: action }) => {
      const command = action.trim() || "status";
      if (command === "login") {
        persistCreds(await pkceLogin());
        return "Anthropic authentication completed.";
      }
      if (command === "logout") {
        const creds = readCreds();
        if (!creds) return "Anthropic is not authenticated.";
        persistCreds({ access: "", refresh: "", expires: 0 });
        return "Anthropic authentication removed.";
      }
      if (command === "status") {
        const creds = readCreds();
        return creds?.access && creds.expires > Date.now()
          ? "Anthropic is authenticated with OAuth."
          : "Anthropic is not authenticated with OAuth.";
      }
      return "usage: cagent auth anthropic [login|logout|status]";
    },
  });
};

export { createAdapter };
export default register;
