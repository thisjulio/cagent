// MCP JSON-RPC 2.0 types

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export interface Transport {
  send(message: JsonRpcMessage): Promise<void>;
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  close(): Promise<void>;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface McpToolCallResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface McpServerConfig {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  auth?: {
    type: "bearer";
    token?: string;
    token_env?: string;
  };
  timeout_ms?: number;
}
