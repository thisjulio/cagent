import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { LspDiagnostic, LspPosition, LspServerConfig } from "./types";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export class LspClient {
  private readonly process: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private version = 0;
  private opened = new Set<string>();

  private constructor(
    private readonly root: string,
    config: LspServerConfig,
  ) {
    const [command, ...args] = config.command;
    if (!command) throw new Error("LSP command is empty");
    const available = spawnSync(
      "sh",
      ["-c", `command -v "$1"`, "sh", command],
      {
        env: process.env,
        stdio: "ignore",
      },
    );
    if (available.status !== 0) {
      throw new Error(`LSP executable not found in $PATH: "${command}"`);
    }
    this.process = spawn(command, args, {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    this.process.stdout.on("data", (chunk) => this.read(chunk));
    this.process.on("error", (error) => {
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
    });
    this.process.on("exit", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error("LSP server exited"));
      }
      this.pending.clear();
    });
    this.process.stderr.resume();
  }

  static async start(
    root: string,
    config: LspServerConfig,
  ): Promise<LspClient> {
    const client = new LspClient(root, config);
    await client.request("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(root).href,
      workspaceFolders: [
        { name: path.basename(root), uri: pathToFileURL(root).href },
      ],
      initializationOptions: config.initialization,
      capabilities: {},
    });
    client.notify("initialized", {});
    return client;
  }

  private read(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const separator = this.buffer.indexOf("\r\n\r\n");
      if (separator < 0) return;
      const header = this.buffer.subarray(0, separator).toString();
      const length = Number(header.match(/Content-Length: (\d+)/i)?.[1]);
      if (
        !Number.isFinite(length) ||
        this.buffer.length < separator + 4 + length
      )
        return;
      const body = this.buffer
        .subarray(separator + 4, separator + 4 + length)
        .toString();
      this.buffer = this.buffer.subarray(separator + 4 + length);
      const message = JSON.parse(body) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };
      if (typeof message.id !== "number") continue;
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    }
  }

  private send(message: Record<string, unknown>) {
    const body = JSON.stringify(message);
    this.process.stdin.write(
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    );
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  async sync(file: string) {
    await this.open(file);
  }

  private notify(method: string, params: unknown) {
    this.send({ jsonrpc: "2.0", method, params });
  }

  async open(file: string) {
    const uri = pathToFileURL(file).href;
    this.version++;
    if (this.opened.has(uri)) {
      this.notify("textDocument/didChange", {
        textDocument: { uri, version: this.version },
        contentChanges: [{ text: fs.readFileSync(file, "utf8") }],
      });
      return;
    }
    this.opened.add(uri);
    this.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: path.extname(file).slice(1),
        version: this.version,
        text: fs.readFileSync(file, "utf8"),
      },
    });
  }

  async call(
    operation: string,
    file: string,
    position?: LspPosition,
  ): Promise<unknown> {
    await this.open(file);
    const uri = pathToFileURL(file).href;
    if (operation === "diagnostics") {
      const result = (await this.request("textDocument/diagnostic", {
        textDocument: { uri },
      }).catch(() => null)) as { items?: LspDiagnostic[] } | null;
      return result?.items ?? [];
    }
    if (operation === "documentSymbol") {
      return this.request("textDocument/documentSymbol", {
        textDocument: { uri },
      });
    }
    const method = {
      definition: "textDocument/definition",
      references: "textDocument/references",
      hover: "textDocument/hover",
    }[operation];
    if (!method || !position)
      throw new Error(`Unsupported LSP operation: ${operation}`);
    return this.request(method, { textDocument: { uri }, position });
  }

  async close() {
    for (const uri of this.opened) {
      this.notify("textDocument/didClose", { textDocument: { uri } });
    }
    await this.request("shutdown", null).catch(() => undefined);
    this.notify("exit", null);
    this.process.kill();
  }
}
