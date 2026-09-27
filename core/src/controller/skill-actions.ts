import crypto from "node:crypto";
import type { Controller } from "./controller";
import type { SkillActivation } from "../skills/types";
import { formatSkillToolOutput } from "../skills/tool-result";

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
  controller.state.chat.push({
    kind: "skill",
    content: output,
    skillName: name,
    expanded: false,
    turnId,
    timestamp: Date.now(),
  });
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
    payload: {
      tool_call_id: id,
      content: output,
      toolName: "skill",
      title: `skill ${name}`,
      args: { name },
    },
  });
  controller.session.append({
    ts: Date.now(),
    turnId,
    type: "skill",
    payload: {
      name,
      content: output,
      expanded: false,
    },
  });
}
