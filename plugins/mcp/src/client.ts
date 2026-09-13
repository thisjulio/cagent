import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JsonRpcMessage, McpTool, McpToolCallResult, McpInitializeResult, Transport as LegacyTransport } from "./types.ts";

function adaptTransport(transport: Transport | LegacyTransport): Transport {
  if ("start" in transport) return transport;
  const legacy = transport;
  return {
    async start() {},
    async close() { await legacy.close(); },
    async send(message) { await legacy.send(message as JsonRpcMessage); },
    set onmessage(handler) { legacy.onMessage(handler as (message: JsonRpcMessage) => void); },
    set onerror(_handler) {},
  } as Transport;
}

export class McpClient {
  private readonly client: Client;

  constructor(transport: Transport | LegacyTransport) {
    this.client = new Client({ name: "cagent", version: "0.1.0" });
    this.transport = adaptTransport(transport);
  }

  private readonly transport: Transport;

  async initialize(_clientInfo: { name: string; version: string }): Promise<McpInitializeResult> {
    await this.client.connect(this.transport);
    return {
      protocolVersion: "2024-11-05",
      capabilities: this.client.getServerCapabilities() ?? {},
      serverInfo: this.client.getServerVersion() ?? { name: "unknown", version: "unknown" },
    };
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.client.listTools();
    return result.tools as McpTool[];
  }

  async callTool(name: string, arguments_: Record<string, unknown>): Promise<McpToolCallResult> {
    return await this.client.callTool({ name, arguments: arguments_ }) as McpToolCallResult;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}