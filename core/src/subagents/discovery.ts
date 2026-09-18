import fs from "node:fs";
import path from "node:path";
import { parseSubagent } from "./frontmatter";
import type { SubagentCatalog } from "./types";

export function discoverSubagents(
  cwd: string,
  roots = ["agents"],
): SubagentCatalog {
  const byName = new Map<string, SubagentCatalog["agents"][number]>();
  for (const root of roots) {
    const dir = path.resolve(cwd, root);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const file = path.join(dir, entry.name);
      try {
        const agent = parseSubagent(fs.readFileSync(file, "utf8"));
        if (!byName.has(agent.name))
          byName.set(agent.name, { ...agent, source: file });
      } catch {
        /* invalid definitions are unavailable */
      }
    }
  }
  return { agents: [...byName.values()], byName };
}
