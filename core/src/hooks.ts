import type { HookDefinition, HookEvent, HookResponse } from "@cagent/sdk";

export class HookRegistry {
  private readonly hooks: HookDefinition[] = [];

  register(hook: HookDefinition): void {
    if (this.hooks.some((item) => item.name === hook.name))
      throw new Error(`duplicate hook: ${hook.name}`);
    this.hooks.push(hook);
  }

  async run(event: HookEvent): Promise<HookResponse[]> {
    const responses: HookResponse[] = [];
    for (const hook of this.hooks) {
      if (hook.phase !== event.phase) continue;
      const response = await hook.handle(event);
      if (response) responses.push(response);
    }
    return responses;
  }
}
