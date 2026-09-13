import { upgrade } from "./upgrade";
import { parseCliArgs, cliHelp } from "./cli-args";
import { bootstrap } from "./bootstrap";

export async function runCli(args: string[]): Promise<boolean> {
  if (args[0] === "upgrade") {
    if (args.length > 1) throw new Error("usage: cagent upgrade");
    await upgrade();
    return true;
  }
  const stdin = args.includes("--help") || args.includes("-h") || args.includes("--version")
    ? ""
    : process.stdin.isTTY ? "" : await Bun.stdin.text();
  const options = parseCliArgs(args, stdin);
  if (options.help) { console.log(cliHelp); return true; }
  if (options.version) { console.log("cagent"); return true; }
  if (options.interactive || (!options.nonInteractive && !options.prompt)) return false;
  await bootstrap({ headless: options });
  return true;
}
