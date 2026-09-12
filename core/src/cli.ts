import { upgrade } from "./upgrade";

export async function runCli(args: string[]): Promise<boolean> {
  if (args[0] !== "upgrade") return false;
  if (args.length > 1) throw new Error("usage: cagent upgrade");
  await upgrade();
  return true;
}
