import { orderContextExtensions } from "@cagent/sdk";
import type { ContextContribution, ContextExtension } from "@cagent/sdk";
import type { Controller } from "./controller";

export async function contextContributions(
  controller: Controller,
  query: string,
): Promise<Array<ContextContribution & { phase: string }>> {
  if (controller.stableContextSessionId !== controller.session.id) {
    controller.stableContext.clear();
    controller.stableContextSessionId = controller.session.id;
  }
  const extensions = controller.contextExtensions;
  let remaining = Math.max(0, controller.contextTokenBudget);
  const contributions: Array<ContextContribution & { phase: string }> = [];
  for (const extension of orderContextExtensions(extensions)) {
    try {
      let entries: ContextContribution[] = [];
      if (extension.phase === "stable") {
        entries = controller.stableContext.get(extension.id) ?? [];
        if (!controller.stableContext.has(extension.id)) {
          const contribution = await contributeWithTimeout(
            controller,
            extension,
            query,
            remaining,
          );
          if (contribution) entries = [contribution];
          controller.stableContext.set(extension.id, entries);
        }
      } else {
        const contribution = await contributeWithTimeout(
          controller,
          extension,
          query,
          remaining,
        );
        if (contribution) entries = [contribution];
      }
      for (const entry of entries) {
        const tokens = Math.max(
          0,
          entry.estimatedTokens ?? Math.ceil(entry.content.length / 4),
        );
        if (tokens > remaining) continue;
        remaining -= tokens;
        contributions.push({ ...entry, phase: extension.phase });
      }
    } catch (error) {
      controller.observability?.recordEvent("context.extension.error", {
        "extension.id": extension.id,
        error: String(error),
      });
    }
  }
  return contributions;
}

async function contributeWithTimeout(
  controller: Controller,
  extension: ContextExtension,
  query: string,
  tokenBudget: number,
): Promise<ContextContribution | void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      extension.contribute({
        query,
        sessionId: controller.session.id,
        tokenBudget,
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("extension timed out")), 250);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
