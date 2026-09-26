import type { ToolArgs, ToolDefinition } from "@cagent/sdk";
import { hasShellControlSyntax } from "../tools";
import type { Controller } from "./controller";

export function askTool(
  controller: Controller,
  tool: ToolDefinition,
  args: ToolArgs,
  title?: string,
): Promise<boolean> {
  if (
    controller.state.permissionMode === "ask" &&
    tool.name !== "bash" &&
    tool.readOnly
  )
    return Promise.resolve(true);
  if (
    controller.state.permissionMode === "read-only" &&
    !isToolReadOnly(tool, args)
  ) {
    controller.state.chat.push({
      kind: "meta",
      content: "permission denied: read-only mode (Ctrl+M to switch)",
    });
    controller.bump();
    return Promise.resolve(false);
  }
  if (
    controller.state.permissionMode === "read-only" ||
    controller.state.permissionMode === "auto"
  )
    return Promise.resolve(true);
  if (controller.config.permissions === false) return Promise.resolve(true);
  const cmd =
    typeof args.command === "string" ? args.command : JSON.stringify(args);
  const hasControlSyntax =
    tool.name === "bash" &&
    hasShellControlSyntax(typeof args.command === "string" ? args.command : "");
  controller.state.pendingAsk = {
    tool: tool.name,
    cmd,
    title,
    args,
    canAlwaysAllow: tool.name === "bash" && !hasControlSyntax,
    allowScope: tool.name === "bash" ? "sempre bash*" : undefined,
  };
  controller.notifyPermissionRequest();
  return new Promise<boolean>((resolve) => {
    controller.setAskResolver(resolve);
  });
}

export function isToolReadOnly(tool: ToolDefinition, args: ToolArgs): boolean {
  if (tool.readOnly) return true;
  if (tool.name !== "bash") return false;
  const command = typeof args.command === "string" ? args.command.trim() : "";
  if (hasShellControlSyntax(command)) return false;
  const words = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const [program, ...flags] = words;
  const safe = /^(ls|pwd|cat|head|tail|grep|rg|find|which)$/.test(
    program ?? "",
  );
  const safeGit =
    program === "git" && /^(status|diff|log|show|branch)$/.test(flags[0] ?? "");
  if (
    !safe &&
    !safeGit &&
    !/^command\s+-v$/.test(`${program} ${flags[0] ?? ""}`)
  )
    return false;
  return !flags.some((flag) =>
    /^(--output(?:=.*)?|-D|-delete|-exec(?:dir)?|--exec(?:dir)?)(?:$|=)/.test(
      flag,
    ),
  );
}
