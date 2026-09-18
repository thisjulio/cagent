import path from "node:path";
import os from "node:os";
import type { SkillSource, Plugin } from "@cagent/sdk";
// ponytail: mirrors the claude-commands plugin — bridges .claude/skills into the core skill discovery.
const source: SkillSource = {
  discover(cwd) {
    return [
      path.join(cwd, ".claude/skills"),
      path.join(os.homedir(), ".claude/skills"),
    ];
  },
};
const register: Plugin = (ctx) => ctx.registerSkillSource(source);
export default register;
