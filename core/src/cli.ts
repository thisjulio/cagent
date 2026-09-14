import { upgrade } from "./upgrade";
import { parseCliArgs, cliHelp } from "./cli-args";
import { bootstrap } from "./bootstrap";
import { VERSION } from "./version";

export async function runCli(args: string[]): Promise<boolean> {
  if (args[0] === "upgrade") {
    if (args.length > 1) throw new Error("usage: cagent upgrade");
    await upgrade();
    return true;
  }
  const hasPromptArgument = args.includes("--prompt") || args.includes("-p") || args.some((arg) => !arg.startsWith("-"));
  const stdin = args.includes("--help") || args.includes("-h") || args.includes("--version") || hasPromptArgument
    ? ""
    : process.stdin.isTTY ? "" : await Bun.stdin.text();
  const options = parseCliArgs(args, stdin);
  if (options.help) { console.log(cliHelp); return true; }
  if (options.version) { console.log(`cagent ${VERSION}`); return true; }
  if (options.interactive || (!options.nonInteractive && !options.prompt)) {
    await bootstrap({ cli: options });
    return true;
  }
  await bootstrap({ headless: options });
  if (options.nonInteractive) {
    process.exit(0);
  }
  return true;
}
