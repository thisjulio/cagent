import fs from "node:fs";
import path from "node:path";

const pluginRoot = path.resolve(import.meta.dir);
const packageName = /^@cagent\/(plugin-[a-z0-9][a-z0-9.-]*)$/;

for (const directory of fs.readdirSync(pluginRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const file = path.join(pluginRoot, directory.name, "package.json");
  if (!fs.existsSync(file)) continue;
  const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
    string,
    unknown
  >;
  const name = String(manifest.name ?? "");
  const privatePackage = manifest.private === true;
  if (!packageName.test(name)) {
    if (!privatePackage)
      throw new Error(
        `${file}: publishable plugin names must use @cagent/plugin-*`,
      );
  }
  if (!privatePackage && typeof manifest.version !== "string")
    throw new Error(`${file}: publishable plugins require a version`);
  if (manifest.type !== "module")
    throw new Error(`${file}: type must be module`);
  if (manifest.main !== "src/index.ts")
    throw new Error(`${file}: main must be src/index.ts`);
  const dependencies = manifest.dependencies as
    | Record<string, string>
    | undefined;
  if (dependencies?.["@cagent/sdk"] !== "workspace:*")
    throw new Error(
      `${file}: plugins must depend on @cagent/sdk via workspace:*`,
    );
}

console.log("Plugin metadata is valid.");
