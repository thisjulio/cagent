import type { Transport, JsonRpcMessage } from "./types.ts";

// ponytail: MCP stdio transport uses newline-delimited JSON over stdin/stdout.
// We spawn the server process and communicate via its stdio streams.
// Reading must be async and continuous to handle server notifications.
export class StdioTransport implements Transport {
  private proc: ReturnType<typeof Bun.spawn>;
  private messageHandler: ((message: JsonRpcMessage) => void) | null = null;
  private buffer = "";
  private closed = false;
  private stdoutReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private stderrReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readonly stdoutDecoder = new TextDecoder();
  private readonly stderrDecoder = new TextDecoder();
  private static readonly MAX_BUFFER_CHARS = 1024 * 1024;

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
    this.stderrReader = reader;
    try {
      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) break;
        if (this.logLevel === "debug" || this.logLevel === "info") {
          process.stderr.write(this.stderrDecoder.decode(value));
        }
      }
    } catch {
      // Stream closed
    } finally {
      this.stderrReader = null;
    }
  }

  private async startReading(): Promise<void> {
    const stdout = this.proc.stdout as ReadableStream<Uint8Array>;
    const reader = stdout.getReader();
    this.stdoutReader = reader;
    try {
      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) break;

        this.buffer += this.stdoutDecoder.decode(value);
        if (this.buffer.length > StdioTransport.MAX_BUFFER_CHARS) {
          this.buffer = this.buffer.slice(-StdioTransport.MAX_BUFFER_CHARS);
        }
        this.processBuffer();
      }
    } catch {
      // Stream closed
    } finally {
      this.stdoutReader = null;
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
    if (this.closed) return;
    this.closed = true;
    await Promise.allSettled([
      this.stdoutReader?.cancel(),
      this.stderrReader?.cancel(),
    ]);
    this.stdoutReader = null;
    this.stderrReader = null;
    this.buffer = "";
    this.proc.kill();
  }
}
