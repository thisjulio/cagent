import type { ToolArgs, ToolEvidence } from "@cagent/sdk";
import type { EventBus } from "./events";
import { runToolPipeline, type ToolAsk } from "./tools";
import { workflowPayload } from "./loop-utils";
import type { TurnOpts, TurnRecord } from "./loop";

export interface ToolLoopCtx {
  opts: TurnOpts;
  nameToCanonical: Record<string, string>;
  records: TurnRecord[];
  evidence: ToolEvidence[];
  changesWorkspace: boolean;
}

export async function runToolCall(
  ctx: ToolLoopCtx,
  tc: { id: string; name: string; arguments: string },
): Promise<void> {
  const { opts } = ctx;
  const tool = opts.tools.find(
    (t) => t.name === (ctx.nameToCanonical[tc.name] ?? tc.name),
  );
  let args: ToolArgs = {};
  try {
    args = JSON.parse(tc.arguments) as ToolArgs;
  } catch {
    // Custom/freeform tools return their payload directly instead of JSON.
    if (tool?.name === "edit_file" && tc.name === "apply_patch")
      args = { patch: tc.arguments };
  }
  const result = tool
    ? await runToolPipeline(
        tool,
        args,
        opts.allowlist,
        opts.ask,
        opts.bus,
        opts.hooks,
        opts.signal,
        opts.observability,
      )
    : { output: `tool not found: ${tc.name}`, isError: true };
  opts.messages.push({
    role: "tool",
    tool_call_id: tc.id,
    content: result.output,
  });
  ctx.records.push({
    role: "tool",
    tool_call_id: tc.id,
    content: result.output,
    toolName: tool?.name ?? tc.name,
    args,
    isError: result.isError,
    changesWorkspace: result.changesWorkspace,
    display: result.display,
  });
  if (result.changesWorkspace) ctx.changesWorkspace = true;
  opts.onToolOutput?.(result.output);
  ctx.evidence.push(...(result.evidence ?? []));
  opts.bus.emit(
    "tool.completed",
    workflowPayload(opts, {
      tool: tool?.name ?? tc.name,
      content: result.output.slice(0, 4000),
      isError: result.isError === true,
      evidence: result.evidence,
    }),
  );
}
