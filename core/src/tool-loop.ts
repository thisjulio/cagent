import type { ToolArgs, ToolEvidence } from "@cagent/sdk";
import type { EventBus } from "./events";
import { runToolPipeline, type ToolAsk } from "./tools";
import { workflowPayload } from "./loop-utils";
import type { TurnOpts, TurnRecord } from "./loop";
import { parseToolCall, type IncomingToolCall } from "./tool-call";
import { ensureToolTitle } from "./tool-title";
import { classifyTool } from "./tool-category";

export interface ToolLoopCtx {
  opts: TurnOpts;
  nameToCanonical: Record<string, string>;
  records: TurnRecord[];
  evidence: ToolEvidence[];
  changesWorkspace: boolean;
}

export async function runToolCall(
  ctx: ToolLoopCtx,
  tc: IncomingToolCall,
): Promise<void> {
  const { opts } = ctx;
  const tool = opts.tools.find(
    (candidate) => candidate.name === (ctx.nameToCanonical[tc.name] ?? tc.name),
  );
  const parsed = parseToolCall(tc);
  const toolName = tool?.name ?? tc.name;
  const title = ensureToolTitle(
    parsed.title,
    toolName,
    classifyTool(toolName),
    parsed.args,
  );
  let args: ToolArgs = parsed.args;
  if (parsed.error) {
    args = {};
  } else if (
    tool?.name === "edit_file" &&
    tc.name === "apply_patch" &&
    Object.keys(args).length === 0
  ) {
    try {
      args = JSON.parse(tc.arguments) as ToolArgs;
    } catch {
      args = { patch: tc.arguments };
    }
  }
  const result = tool
    ? parsed.error
      ? { output: parsed.error, isError: true }
      : await runToolPipeline(
          tool,
          args,
          opts.allowlist,
          opts.ask,
          opts.bus,
          opts.hooks,
          opts.signal,
          opts.observability,
          title,
          opts.readOnly,
        )
    : { output: `tool not found: ${tc.name}`, isError: true };
  const normalizedCall = {
    id: tc.id,
    name: tc.name,
    arguments: parsed.error
      ? tc.arguments
      : JSON.stringify({ _cagent: { title }, args }),
  };
  const assistant = opts.messages.at(-1);
  if (assistant?.tool_calls) {
    const current = assistant.tool_calls.find((call) => call.id === tc.id);
    if (current) Object.assign(current, normalizedCall);
  }
  opts.messages.push({
    role: "tool",
    tool_call_id: tc.id,
    content: result.output,
  });
  ctx.records.push({
    role: "tool",
    tool_call_id: tc.id,
    content: result.output,
    toolName,
    title,
    args,
    isError: result.isError,
    denied: result.denied,
    changesWorkspace: result.changesWorkspace,
    display: result.display,
    summary: result.summary,
  });
  if (result.changesWorkspace) ctx.changesWorkspace = true;
  opts.onToolOutput?.(result.output);
  ctx.evidence.push(...(result.evidence ?? []));
  opts.bus.emit(
    "tool.completed",
    workflowPayload(opts, {
      tool: toolName,
      content: result.output.slice(0, 4000),
      isError: result.isError === true,
      evidence: result.evidence,
    }),
  );
}
