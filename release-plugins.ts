import type { Plugin } from "@cagent/sdk";
import plugin0 from "./plugins/bash/src/index";
import plugin1 from "./plugins/claude-agents/src/index";
import plugin2 from "./plugins/claude-commands/src/index";
import plugin3 from "./plugins/claude-hooks/src/index";
import plugin4 from "./plugins/code-tools/src/index";
import plugin5 from "./plugins/codex-agents/src/index";
import plugin6 from "./plugins/codex-prompts/src/index";
import plugin7 from "./plugins/llama.cpp/src/index";
import plugin8 from "./plugins/mcp/src/index";
import plugin9 from "./plugins/openai/src/index";
import plugin10 from "./plugins/stub/src/index";
import plugin11 from "./plugins/claude-plugins/src/index";

export const pluginLoaders: Record<string, Plugin> = {
  bash: plugin0,
  "claude-agents": plugin1,
  "claude-commands": plugin2,
  "claude-hooks": plugin3,
  "code-tools": plugin4,
  "codex-agents": plugin5,
  "codex-prompts": plugin6,
  "llama.cpp": plugin7,
  mcp: plugin8,
  openai: plugin9,
  stub: plugin10,
  "claude-plugins": plugin11,
};
