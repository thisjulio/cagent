import fs from "node:fs";
import path from "node:path";

const root = path.resolve("core/src/ui/components");
const violations: string[] = [];
const hardcodedColor = /#[\da-f]{3,8}\b/i;
const localBreakpoint =
  /(?:\.width|\bwidth|\bcolumns)\s*(?:<=|>=|<|>)\s*\d{2,}/;

function inspect(directory: string): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) inspect(file);
    else if (/\.tsx?$/.test(entry.name)) {
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (hardcodedColor.test(line))
          violations.push(`${file}:${index + 1}: hardcoded color`);
        if (localBreakpoint.test(line))
          violations.push(`${file}:${index + 1}: local responsive breakpoint`);
      });
    }
  }
}

inspect(root);
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Design System guardrails passed.");
}
