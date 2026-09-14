import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const pluginsDir = path.join(root, "plugins");
const names = fs.readdirSync(pluginsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(pluginsDir, entry.name, "src", "index.ts")))
  .map((entry) => entry.name)
  .sort();

const imports = names.map((name, index) => `import plugin${index} from "./plugins/${name}/src/index";`).join("\n");
const entries = names.map((name, index) => `  ${JSON.stringify(name)}: plugin${index},`).join("\n");
const output = `import type { Plugin } from "@cagent/sdk";\n${imports}\n\nexport const pluginLoaders: Record<string, Plugin> = {\n${entries}\n};\n`;
fs.writeFileSync(path.join(root, "release-plugins.ts"), output);
