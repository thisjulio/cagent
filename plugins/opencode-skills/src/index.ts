import os from "node:os";
import path from "node:path";
import type { Plugin, SkillSource } from "@cagent/sdk";

const source: SkillSource = {
  discover(cwd) {
    const home = os.homedir();
    return [
      path.join(cwd, ".opencode/skills"),
      path.join(home, ".config/opencode/skills"),
      path.join(home, ".opencode/skills"),
    ];
  },
};

const register: Plugin = (context) => context.registerSkillSource(source);
export default register;
