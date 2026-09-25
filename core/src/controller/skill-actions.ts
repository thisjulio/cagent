import crypto from "node:crypto";
import type { Controller } from "./controller";
import type { SkillActivation } from "../skills/types";
import { formatSkillToolOutput } from "../skills/tool-result";
import { toolPost, toolPre } from "./tool-events";

export async function invokeSkill(
  controller: Controller,
  name: string,
  activation: SkillActivation | undefined,
): Promise<boolean> {
  if (activation === undefined) return false;
  const activated = controller.messages.some((message) => {
    const content = typeof message.content === "string" ? message.content : "";
    return (
      content.includes(`<skill_content name="${name}"`) ||
      content.includes(`<name>${name}</name>`)
    );
  });
  if (!activated) appendSkillActivation(controller, name, activation);
  controller.state.notice = "";
  controller.bump();
  return true;
}

function appendSkillActivation(
  controller: Controller,
  name: string,
  activation: SkillActivation,
): void {
  const turnId = controller.state.currentTurnId ?? crypto.randomUUID();
  const id = `skill-${controller.session.id}-${controller.nextSkillCallId()}`;
  const toolCall = { id, name: "skill", arguments: JSON.stringify({ name }) };
  const output = formatSkillToolOutput(
    name,
    activation.directory,
    activation.content,
  );
  controller.messages.push({
    role: "assistant",
    content: "",
    tool_calls: [toolCall],
  });
  controller.messages.push({ role: "tool", tool_call_id: id, content: output });
  toolPre(controller.state, { tool: "skill", args: { name } });
  toolPost(controller.state, { tool: "skill", result: { output } });
  controller.session.append({
    ts: Date.now(),
    turnId,
    type: "meta",
    payload: {
      kind: "skill-activated",
      format: "tool-v1",
      name,
      source: "user",
    },
  });
  controller.session.append({
    ts: Date.now(),
    turnId,
    type: "assistant",
    payload: { content: "", tool_calls: [toolCall] },
  });
  controller.session.append({
    ts: Date.now(),
    turnId,
    type: "tool",
    payload: { tool_call_id: id, content: output, toolName: "skill" },
  });
}
