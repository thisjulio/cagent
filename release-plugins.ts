import type { Plugin } from "@cagent/sdk";
import plugin0 from "./plugins/bash/src/index";
import plugin1 from "./plugins/claude-agents/src/index";
import plugin2 from "./plugins/claude-commands/src/index";
import plugin3 from "./plugins/claude-hooks/src/index";
import plugin4 from "./plugins/claude-plugins/src/index";
import plugin5 from "./plugins/claude-skills/src/index";
import plugin6 from "./plugins/code-tools/src/index";
import plugin7 from "./plugins/codex-agents/src/index";
import plugin8 from "./plugins/codex-prompts/src/index";
import plugin9 from "./plugins/llama.cpp/src/index";
import plugin10 from "./plugins/mcp/src/index";
import plugin11 from "./plugins/openai/src/index";
import plugin12 from "./plugins/stub/src/index";

export const pluginLoaders: Record<string, Plugin> = {
  bash: plugin0,
  "claude-agents": plugin1,
  "claude-commands": plugin2,
  "claude-hooks": plugin3,
  "claude-plugins": plugin4,
  "claude-skills": plugin5,
  "code-tools": plugin6,
  "codex-agents": plugin7,
  "codex-prompts": plugin8,
  "llama.cpp": plugin9,
  mcp: plugin10,
  openai: plugin11,
  stub: plugin12,
};
