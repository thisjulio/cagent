import type { Controller } from "./controller";
import { appendChat } from "./chat-buffer";

export async function submitSubagent(controller: Controller, name: string, task: string, original: string): Promise<void> {
  const s = controller.state;
  s.input = "";
  appendChat(s, { kind: "user", content: original });
  controller.session.append({ ts: Date.now(), type: "user", payload: { content: original } });
  controller.session.append({ ts: Date.now(), type: "meta", payload: { kind: "subagent-start", name } });
  appendChat(s, { kind: "assistant", content: "", subagent: name, subagentHeader: true });
  s.busy = true;
  s.turnStartedAt = Date.now();
  controller.bump();
  try {
    if (!controller.invokeSubagent) throw new Error("subagent runtime is unavailable");
    const result = await controller.invokeSubagent({
      name,
      task,
      context: controller.messages.slice(),
    });
    controller.messages.push(
      { role: "user", content: original },
      { role: "assistant", content: result },
    );
    appendChat(s, { kind: "assistant", content: result, subagent: name });
    controller.session.append({ ts: Date.now(), type: "assistant", payload: { content: result, subagent: name } });
  } catch (error) {
    s.notice = `error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    s.busy = false;
    s.turnStartedAt = null;
    s.elapsedMs = 0;
    controller.bump();
  }
}
