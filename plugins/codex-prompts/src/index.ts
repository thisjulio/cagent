import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { CommandSource, Plugin } from "@cagent/sdk";
const source: CommandSource = {
  discover(cwd) {
    return [
      path.join(cwd, ".codex/prompts"),
      path.join(os.homedir(), ".codex/prompts"),
    ]
      .flatMap((directory) => {
        if (!fs.existsSync(directory)) return [];
        return fs
          .readdirSync(directory, { withFileTypes: true })
          .filter((e) => e.isFile() && e.name.endsWith(".md"))
          .map((e) => {
            const file = path.join(directory, e.name);
            return {
              name: e.name.slice(0, -3),
              file,
              content: fs.readFileSync(file, "utf8").trim(),
            };
          });
      })
      .filter((c) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.name));
  },
};
const register: Plugin = (ctx) => ctx.registerCommandSource(source);
export default register;
