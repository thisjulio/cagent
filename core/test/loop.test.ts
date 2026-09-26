import { describe, expect, it } from "bun:test";
import {
  defineTool,
  type LlmCallOptions,
  type LlmChunk,
  type Message,
  type ProviderAdapter,
} from "@cagent/sdk";
import { EventBus } from "../src/events";
import { runTurn, streamOnce } from "../src/loop";

function fakeAdapter(script: LlmChunk[][], failFirst = 0): ProviderAdapter {
  let calls = 0;
  return {
    async list_models() {
      return ["m"];
    },
    async prepare_call(o: LlmCallOptions) {
      return o;
    },
    async *stream() {
      calls++;
      if (calls <= failFirst) throw new Error("boom");
      for (const c of script[calls - 1 - failFirst] ?? []) yield c;
    },
  };
}

describe("agent loop", () => {
  const tool = defineTool("bash", "exec", {}, async () => ({
    output: "result",
  }));
  const bus = new EventBus();

  it("requires every declared tool argument in the wrapped provider schema", async () => {
    let receivedParameters: Record<string, unknown> | undefined;
    const adapter = fakeAdapter([[{ type: "finish", finish_reason: "stop" }]]);
    adapter.prepare_call = async (options) => {
      receivedParameters = options.tools?.[0]?.parameters as Record<
        string,
        unknown
      >;
      return options;
    };
    await runTurn({
      adapter,
      model: "m",
      messages: [{ role: "user", content: "load skill" }],
      tools: [
        defineTool(
          "skill",
          "Load a skill",
          {
            type: "object",
            properties: {
              name: { type: "string", enum: ["review-loop"] },
              resource: { type: "string" },
            },
            required: ["name"],
            additionalProperties: false,
          },
          async () => ({ output: "loaded" }),
        ),
      ],
      allowlist: [],
      ask: async () => false,
      bus,
    });

    const args = receivedParameters?.properties as Record<string, unknown>;
    expect(receivedParameters?.required).toEqual(["_cagent", "args"]);
    expect((args.args as Record<string, unknown>).required).toEqual([
      "name",
      "resource",
    ]);
  });

  it("multi-turn with a tool call", async () => {
    const messages: Message[] = [
      { role: "system", content: "s" },
      { role: "user", content: "run ls" },
    ];
    const r = await runTurn({
      adapter: fakeAdapter([
        [
          { type: "text", text: "running" },
          {
            type: "tool-call",
            tool_call: {
              id: "t1",
              name: "bash",
              arguments: '{"command":"ls"}',
            },
          },
          { type: "finish", finish_reason: "stop" },
        ],
        [
          { type: "text", text: "done" },
          { type: "finish", finish_reason: "stop" },
        ],
      ]),
      model: "m",
      messages,
      tools: [tool],
      allowlist: ["ls"],
      ask: async () => false,
      bus,
    });
    expect(r.records).toHaveLength(3);
    expect(messages[messages.length - 3].role).toBe("assistant");
    expect(messages[messages.length - 3].tool_calls).toEqual([
      {
        id: "t1",
        name: "bash",
        arguments: '{"_cagent":{"title":"Run ls"},"args":{"command":"ls"}}',
      },
    ]);
    expect(messages[messages.length - 2].role).toBe("tool");
    expect(messages[messages.length - 2].content).toBe("result");
    expect(messages[messages.length - 1].role).toBe("assistant");
  });

  it("unwraps and persists a tool title without exposing metadata to the tool", async () => {
    let received: Record<string, unknown> | undefined;
    const titled = defineTool(
      "bash",
      "exec",
      { type: "object", properties: { command: { type: "string" } } },
      async (args) => {
        received = args;
        return { output: "result" };
      },
    );
    const messages: Message[] = [{ role: "user", content: "run ls" }];
    const r = await runTurn({
      adapter: fakeAdapter([
        [
          {
            type: "tool-call",
            tool_call: {
              id: "t1",
              name: "bash",
              arguments:
                '{"_cagent":{"title":"  Executando ls\\n  "},"args":{"command":"ls"}}',
            },
          },
          { type: "finish", finish_reason: "stop" },
        ],
        [{ type: "finish", finish_reason: "stop" }],
      ]),
      model: "m",
      messages,
      tools: [titled],
      allowlist: ["ls"],
      ask: async () => false,
      bus,
    });

    expect(received).toEqual({ command: "ls" });
    expect(r.records.find((record) => record.role === "tool")?.title).toBe(
      "Executando ls",
    );
    expect(messages[1]?.tool_calls?.[0]).toEqual({
      id: "t1",
      name: "bash",
      arguments:
        '{"_cagent":{"title":"Executando ls"},"args":{"command":"ls"}}',
    });
  });

  it("rejects a malformed reserved envelope without executing the tool", async () => {
    let executed = false;
    const guarded = defineTool("bash", "exec", {}, async () => {
      executed = true;
      return { output: "unexpected" };
    });
    const r = await runTurn({
      adapter: fakeAdapter([
        [
          {
            type: "tool-call",
            tool_call: {
              id: "t1",
              name: "bash",
              arguments: '{"_cagent":{"title":"bad"}}',
            },
          },
          { type: "finish", finish_reason: "stop" },
        ],
        [{ type: "finish", finish_reason: "stop" }],
      ]),
      model: "m",
      messages: [{ role: "user", content: "run" }],
      tools: [guarded],
      allowlist: ["ls"],
      ask: async () => true,
      bus,
    });

    expect(executed).toBe(false);
    expect(r.records.find((record) => record.role === "tool")?.isError).toBe(
      true,
    );
  });

  it("passes the abort signal to the provider stream", async () => {
    const signal = new AbortController().signal;
    let received: AbortSignal | undefined;
    const adapter = fakeAdapter([[{ type: "finish", finish_reason: "stop" }]]);
    const stream = adapter.stream.bind(adapter);
    adapter.stream = (request, receivedSignal) => {
      received = receivedSignal;
      return stream(request, receivedSignal);
    };
    await streamOnce({
      adapter,
      model: "m",
      messages: [],
      tools: [],
      signal,
    });
    expect(received).toBe(signal);
  });

  it("does not retry a provider stream after cancellation", async () => {
    const controller = new AbortController();
    let calls = 0;
    const adapter = fakeAdapter([[]]);
    adapter.stream = () => {
      calls++;
      controller.abort();
      throw new Error("cancelled");
    };
    await expect(
      streamOnce({
        adapter,
        model: "m",
        messages: [],
        tools: [],
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled");
    expect(calls).toBe(1);
  });

  it("streamOnce passes reasoning to the callback", async () => {
    const seen: string[] = [];
    const r = await streamOnce({
      adapter: fakeAdapter([
        [
          { type: "reasoning", text: "r1" },
          { type: "text", text: "ok" },
          { type: "finish", finish_reason: "stop" },
        ],
      ]),
      model: "m",
      messages: [],
      tools: [],
      onReasoning: (t) => seen.push(t),
    });
    expect(r.text).toBe("ok");
    expect(seen).toEqual(["r1"]);
  });

  it("persists the cumulative assistant snapshot as text streams", async () => {
    const snapshots: string[] = [];
    await streamOnce({
      adapter: fakeAdapter([
        [
          { type: "text", text: "partial" },
          { type: "text", text: " response" },
          { type: "finish", finish_reason: "stop" },
        ],
      ]),
      model: "m",
      messages: [],
      tools: [],
      onAssistantSnapshot: (content) => snapshots.push(content),
    });
    expect(snapshots).toEqual(["partial", "partial response"]);
  });

  it("retries with backoff until success", async () => {
    const r = await streamOnce({
      adapter: fakeAdapter(
        [
          [
            { type: "text", text: "ok" },
            { type: "finish", finish_reason: "stop" },
          ],
        ],
        1,
      ),
      model: "m",
      messages: [],
      tools: [],
      attempts: 3,
    });
    expect(r.text).toBe("ok");
  });

  it("an unknown tool becomes a result error and ends the loop", async () => {
    const messages: Message[] = [{ role: "user", content: "x" }];
    const r = await runTurn({
      adapter: fakeAdapter([
        [
          {
            type: "tool-call",
            tool_call: { id: "t9", name: "missing", arguments: "{}" },
          },
          { type: "finish", finish_reason: "stop" },
        ],
        [
          { type: "text", text: "ok" },
          { type: "finish", finish_reason: "stop" },
        ],
      ]),
      model: "m",
      messages,
      tools: [tool],
      allowlist: [],
      ask: async () => true,
      bus,
    });
    expect(r.records).toHaveLength(3);
    const toolMsg = r.records.find((x) => x.role === "tool");
    expect(toolMsg?.content).toContain("missing");
  });

  it("provider schema override maps the model name back to the canonical registry name", async () => {
    const edit = defineTool(
      "edit_file",
      "edit",
      { type: "object", properties: {} },
      async () => ({ output: "edited" }),
    );
    let sentTools: string[] = [];
    let calls = 0;
    const script: LlmChunk[][] = [
      [
        {
          type: "tool-call",
          tool_call: {
            id: "t1",
            name: "apply_patch",
            arguments: '{"patch":"x"}',
          },
        },
        { type: "finish", finish_reason: "stop" },
      ],
      [
        { type: "text", text: "ok" },
        { type: "finish", finish_reason: "stop" },
      ],
    ];
    const adapter: ProviderAdapter = {
      async list_models() {
        return ["m"];
      },
      tool_overrides: () => ({
        edit_file: {
          name: "apply_patch",
          parameters: {
            type: "object",
            properties: { patch: { type: "string" } },
          },
        },
      }),
      async prepare_call(o: LlmCallOptions) {
        sentTools = o.tools.map((t) => t.name);
        return o;
      },
      async *stream() {
        calls++;
        for (const c of script[calls - 1] ?? []) yield c;
      },
    };
    const messages: Message[] = [{ role: "user", content: "x" }];
    const r = await runTurn({
      adapter,
      model: "m",
      messages,
      tools: [edit],
      allowlist: [],
      ask: async () => true,
      bus,
    });
    expect(sentTools).toEqual(["apply_patch"]);
    const toolMsg = r.records.find((x) => x.role === "tool");
    expect(toolMsg?.toolName).toBe("edit_file");
    expect(toolMsg?.content).toBe("edited");
  });

  it("interrupting stops the stream without executing tools", async () => {
    const messages: Message[] = [{ role: "user", content: "x" }];
    const r = await runTurn({
      adapter: fakeAdapter([
        [
          { type: "text", text: "partial" },
          {
            type: "tool-call",
            tool_call: { id: "t1", name: "bash", arguments: "{}" },
          },
          { type: "finish", finish_reason: "stop" },
        ],
      ]),
      model: "m",
      messages,
      tools: [tool],
      allowlist: ["ls"],
      ask: async () => false,
      bus,
      interrupted: () => true,
    });
    expect(r.interrupted).toBe(true);
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe("assistant");
  });

  it("runs mandatory verification after a workspace-changing tool", async () => {
    let verified = 0;
    const edit = defineTool("edit_file", "edit", {}, async () => ({
      output: "edited",
      changesWorkspace: true,
    }));
    const r = await runTurn({
      adapter: fakeAdapter([
        [
          {
            type: "tool-call",
            tool_call: { id: "edit", name: "edit_file", arguments: "{}" },
          },
          { type: "finish", finish_reason: "stop" },
        ],
        [
          { type: "text", text: "done" },
          { type: "finish", finish_reason: "stop" },
        ],
      ]),
      model: "m",
      messages: [{ role: "user", content: "edit" }],
      tools: [edit],
      allowlist: [],
      ask: async () => true,
      bus,
      verification: {
        run: async () => {
          verified++;
          return { passed: true, output: "all checks passed" };
        },
      },
    });

    expect(verified).toBe(1);
    expect(r.verification?.passed).toBe(true);
  });

  it("does not complete when mandatory verification fails repeatedly", async () => {
    const edit = defineTool("edit_file", "edit", {}, async () => ({
      output: "edited",
      changesWorkspace: true,
    }));
    await expect(
      runTurn({
        adapter: fakeAdapter([
          [
            {
              type: "tool-call",
              tool_call: { id: "edit", name: "edit_file", arguments: "{}" },
            },
            { type: "finish", finish_reason: "stop" },
          ],
          [
            { type: "text", text: "done" },
            { type: "finish", finish_reason: "stop" },
          ],
        ]),
        model: "m",
        messages: [{ role: "user", content: "edit" }],
        tools: [edit],
        allowlist: [],
        ask: async () => true,
        bus,
        verification: {
          run: async () => ({ passed: false, output: "lint failed" }),
        },
      }),
    ).rejects.toThrow("mandatory verification failed twice");
  });
});
