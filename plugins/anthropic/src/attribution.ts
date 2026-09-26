import { createHash } from "node:crypto";
import type { Message } from "@cagent/sdk";

const FINGERPRINT_SALT = "59cf53e54c78";
const PLUGIN_VERSION = "0.1.0";

function firstUserText(messages: Message[]): string {
  const first = messages.find((message) => message.role === "user");
  if (!first) return "";
  if (typeof first.content === "string") return first.content;
  return first.content
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

function fingerprint(message: string): string {
  const chars = [4, 7, 20].map((index) => message[index] || "0").join("");
  return createHash("sha256")
    .update(`${FINGERPRINT_SALT}${chars}${PLUGIN_VERSION}`)
    .digest("hex")
    .slice(0, 3);
}

export function billingAttribution(messages: Message[]): string {
  const entrypoint = resolveEntrypoint();
  const version = `${PLUGIN_VERSION}.${fingerprint(firstUserText(messages))}`;
  return `x-anthropic-billing-header: cc_version=${version}; cc_entrypoint=${entrypoint};`;
}

export function resolveEntrypoint(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2),
  isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
): string {
  if (env.CLAUDE_CODE_ENTRYPOINT) return env.CLAUDE_CODE_ENTRYPOINT;

  const mcpIndex = argv.indexOf("mcp");
  if (mcpIndex !== -1 && argv[mcpIndex + 1] === "serve") return "mcp";
  if (isTruthy(env.CLAUDE_CODE_ACTION)) return "claude-code-github-action";

  return isInteractive ? "cli" : "sdk-cli";
}

function isTruthy(value: string | undefined): boolean {
  return (
    value !== undefined &&
    !["", "0", "false", "no"].includes(value.toLowerCase())
  );
}
