import type { Controller } from "./controller";
import { appendChat } from "./chat-buffer";
import { runToolPipeline } from "../tools";

export async function submitShell(controller: Controller, command: string): Promise<void> {
  const tool = controller.registry.tool("bash");
  if (!tool) {
    controller.state.notice = "bash tool is not available";
    controller.bump();
    return;
  }
  const callId = `input-bash-${Date.now()}-${controller.nextSkillCallId()}`;
  const args = { command };
  const s = controller.state;
  appendChat(s, { kind: "user", content: `$${command}` });
  s.busy = true;
  s.turnStartedAt = Date.now();
  controller.resetTurn();
  controller.session.append({ ts: Date.now(), type: "user", payload: { content: `$${command}` } });
  controller.messages.push({ role: "user", content: `$${command}` });
  controller.messages.push({
    role: "assistant",
    content: "",
    tool_calls: [{ id: callId, name: tool.name, arguments: JSON.stringify(args) }],
  });
  controller.bump();
  try {
    const result = await runToolPipeline(
      tool,
      args,
      controller.config.allowlist,
      controller.ask,
      controller.bus,
      controller.registry.hooks,
      controller.signal,
    );
    controller.messages.push({ role: "tool", tool_call_id: callId, content: result.output });
    controller.session.append({
      ts: Date.now(),
      type: "assistant",
      payload: { content: "", tool_calls: [{ id: callId, name: tool.name, arguments: JSON.stringify(args) }] },
    });
    controller.session.append({
      ts: Date.now(),
      type: "tool",
      payload: { tool_call_id: callId, content: result.output, isError: result.isError, toolName: tool.name },
    });
  } finally {
    s.busy = false;
    s.turnStartedAt = null;
    controller.bump();
  }
}
