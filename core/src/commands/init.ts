import fs from "node:fs";
import path from "node:path";
import type { Controller } from "../controller/controller";
import { notify } from "../controller/chat-buffer";
import { expandCommand } from "./discovery";
import { buildInitPrompt, type ProjectDocs } from "./init-prompt";

const OTHER_INSTRUCTIONS = [
  [".github", "copilot-instructions.md"].join("/"),
  [".cagent", "rules"].join("/"),
];
const REFERENCES = ["README.md", "CONTRIBUTING.md", "CONTEXT.md", "docs/adr"];

export function detectProjectDocs(cwd: string): ProjectDocs {
  const present = (items: string[]) =>
    items.filter((item) => fs.existsSync(path.join(cwd, item)));
  return {
    agentsMd: fs.existsSync(path.join(cwd, "AGENTS.md"))
      ? "AGENTS.md"
      : undefined,
    otherInstructions: present(OTHER_INSTRUCTIONS),
    references: present(REFERENCES),
  };
}

export async function runInit(c: Controller, arg: string): Promise<void> {
  if (c.state.busy) {
    notify(c.state, "/init: wait for the current turn to finish");
    return;
  }
  const override = c.customCommand("/init");
  const prompt = override
    ? expandCommand(override, arg)
    : buildInitPrompt({
        docs: detectProjectDocs(process.cwd()),
        focus: arg.trim(),
        readOnly: c.readOnly,
      });
  await c.submit(prompt);
  if (!c.state.busy) c.refreshProjectContext();
}
