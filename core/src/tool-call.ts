import type { ToolArgs } from "@cagent/sdk";
import { TOOL_METADATA_KEY } from "@cagent/sdk";
import { normalizeToolTitle } from "./tool-title";

export type IncomingToolCall = {
  id: string;
  name: string;
  arguments: string;
  title?: string;
};

export type ParsedToolCall = {
  args: ToolArgs;
  title?: string;
  arguments: string;
  error?: string;
};

export function parseToolCall(call: IncomingToolCall): ParsedToolCall {
  try {
    const payload = JSON.parse(call.arguments) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return {
        args: {},
        title: normalizeToolTitle(call.title),
        arguments: call.arguments,
      };
    const object = payload as Record<string, unknown>;
    if (TOOL_METADATA_KEY in object) {
      const metadata = object[TOOL_METADATA_KEY];
      const args = object.args;
      if (!metadata || typeof metadata !== "object" || !isToolArgs(args))
        return {
          args: {},
          title: normalizeToolTitle(call.title),
          arguments: call.arguments,
          error: "invalid _cagent tool-call envelope",
        };
      const title = normalizeToolTitle(
        (metadata as Record<string, unknown>).title,
      );
      return { args, title, arguments: JSON.stringify(args) };
    }
    return {
      args: object,
      title: normalizeToolTitle(call.title),
      arguments: call.arguments,
    };
  } catch {
    return {
      args: {},
      title: normalizeToolTitle(call.title),
      arguments: call.arguments,
    };
  }
}

function isToolArgs(value: unknown): value is ToolArgs {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
