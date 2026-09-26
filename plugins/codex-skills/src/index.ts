import os from "node:os";
import path from "node:path";
import type { Plugin, SkillSource } from "@cagent/sdk";

const source: SkillSource = {
  discover(cwd) {
    return [
      path.join(cwd, ".codex/skills"),
      path.join(os.homedir(), ".codex/skills"),
    ];
  },
};

const register: Plugin = (context) => context.registerSkillSource(source);
export default register;
