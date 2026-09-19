import type { Transport, JsonRpcMessage } from "./types.ts";

// ponytail: MCP stdio transport uses newline-delimited JSON over stdin/stdout.
// We spawn the server process and communicate via its stdio streams.
// Reading must be async and continuous to handle server notifications.
export class StdioTransport implements Transport {
  private proc: ReturnType<typeof Bun.spawn>;
  private messageHandler: ((message: JsonRpcMessage) => void) | null = null;
  private buffer = "";
  private closed = false;

  constructor(
    private command: string,
    private args: string[],
    private env: Record<string, string>,
    private logLevel: "silent" | "error" | "warn" | "info" | "debug" = "silent",
  ) {
    this.proc = Bun.spawn([command, ...args], {
      env: { ...process.env, ...env },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Start reading stdout in background (fire and forget)
    this.startReading();
    this.startReadingStderr();
  }

  private async startReadingStderr(): Promise<void> {
    const stderr = this.proc.stderr as ReadableStream<Uint8Array> | null;
    if (!stderr) return;
    const reader = stderr.getReader();
    const decoder = new TextDecoder();
    try {
      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) break;
        if (this.logLevel === "debug" || this.logLevel === "info") {
          process.stderr.write(decoder.decode(value));
        }
      }
    } catch {
      // Stream closed
    }
  }

  private async startReading(): Promise<void> {
    const stdout = this.proc.stdout as ReadableStream<Uint8Array>;
    const reader = stdout.getReader();
    try {
      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) break;

        this.buffer += new TextDecoder().decode(value);
        this.processBuffer();
      }
    } catch {
      // Stream closed
    }
  }

  private processBuffer(): void {
    let idx = 0;
    while (idx < this.buffer.length) {
      const newline = this.buffer.indexOf("\n", idx);
      if (newline === -1) break;
      const line = this.buffer.substring(idx, newline).trim();
      idx = newline + 1;
      if (!line) continue;
      try {
        const message: JsonRpcMessage = JSON.parse(line);
        if (this.messageHandler) this.messageHandler(message);
      } catch {
        // Ignore malformed lines
      }
    }
    this.buffer = this.buffer.substring(idx);
  }

  async send(message: JsonRpcMessage): Promise<void> {
    const line = JSON.stringify(message) + "\n";
    const encoder = new TextEncoder();
    const stdin = this.proc.stdin;
    if (
      stdin &&
      typeof stdin === "object" &&
      typeof stdin.write === "function"
    ) {
      stdin.write(encoder.encode(line));
    }
  }

  onMessage(handler: (message: JsonRpcMessage) => void): void {
    this.messageHandler = handler;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.proc.kill();
  }
}
