import type { Transport, JsonRpcMessage } from "./types.ts";

// ponytail: MCP HTTP transport uses POST for requests and SSE for responses.
// Each request gets a unique ID; responses come back on the SSE stream.
export class HttpTransport implements Transport {
  private messageHandler: ((message: JsonRpcMessage) => void) | null = null;
  private abortController: AbortController | null = null;
  private closed = false;

  constructor(
    private url: string,
    private headers: Record<string, string>,
  ) {}

  async send(message: JsonRpcMessage): Promise<void> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(
        `MCP HTTP request failed: ${response.status} ${response.statusText}`,
      );
    }

    // ponytail: MCP over HTTP returns the response directly, not via SSE stream.
    // The SSE endpoint is for server->client notifications, which we don't need for tool calls.
    const result = await response.json();
    if (this.messageHandler && result.id !== undefined) {
      this.messageHandler(result as JsonRpcMessage);
    }
  }

  onMessage(handler: (message: JsonRpcMessage) => void): void {
    this.messageHandler = handler;
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
