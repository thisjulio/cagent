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

type PublishDiagnostics = {
  method?: string;
  params?: { uri?: string; diagnostics?: LspDiagnostic[] };
};

function workspaceUri(root: string): string {
  const uri = pathToFileURL(root).href;
  return uri.endsWith("/") ? uri : `${uri}/`;
}

function languageId(file: string): string {
  const ids: Record<string, string> = {
    ts: "typescript",
    tsx: "typescriptreact",
    js: "javascript",
    jsx: "javascriptreact",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    jsonc: "jsonc",
  };
  const extension = path.extname(file).slice(1).toLowerCase();
  return ids[extension] ?? extension;
}

export class LspClient {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly pushDiagnostics: boolean;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private version = 0;
  private opened = new Set<string>();
  private diagnostics = new Map<string, LspDiagnostic[]>();
  private diagnosticWaiters = new Map<
    string,
    Array<{
      resolve: (diagnostics: LspDiagnostic[]) => void;
      reject: (error: Error) => void;
    }>
  >();
  private serverReady?: () => void;

  private constructor(
    private readonly root: string,
    config: LspServerConfig,
  ) {
    const [command, ...args] = config.command;
    if (!command) throw new Error("LSP command is empty");
    this.pushDiagnostics = command.includes("biome");
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
      rootUri: workspaceUri(root),
      workspaceFolders: [
        { name: path.basename(root), uri: workspaceUri(root) },
      ],
      initializationOptions: config.initialization,
      capabilities: {
        workspace: { configuration: true, workspaceFolders: true },
        textDocument: { publishDiagnostics: { versionSupport: true } },
      },
    });
    const ready = config.command[0]?.includes("biome")
      ? client.waitForServerReady()
      : undefined;
    client.notify("initialized", {});
    await ready;
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
        method?: string;
        params?: { items?: unknown[] };
        result?: unknown;
        error?: { message: string };
      };
      const notification = message as PublishDiagnostics;
      if (
        message.method === "window/logMessage" &&
        (message.params as { message?: string } | undefined)?.message?.includes(
          "Server initialized",
        )
      ) {
        this.serverReady?.();
        this.serverReady = undefined;
      }
      if (
        notification.method === "textDocument/publishDiagnostics" &&
        notification.params?.uri
      ) {
        const uri = notification.params.uri;
        const diagnostics = notification.params.diagnostics ?? [];
        this.diagnostics.set(uri, diagnostics);
        for (const waiter of this.diagnosticWaiters.get(uri) ?? [])
          waiter.resolve(diagnostics);
        this.diagnosticWaiters.delete(uri);
        continue;
      }
      if (typeof message.id === "number" && message.method) {
        if (message.method === "workspace/configuration") {
          this.send({
            jsonrpc: "2.0",
            id: message.id,
            result: (message.params?.items ?? []).map(() => ({})),
          });
        } else if (message.method === "workspace/workspaceFolders") {
          this.send({
            jsonrpc: "2.0",
            id: message.id,
            result: [
              { name: path.basename(this.root), uri: workspaceUri(this.root) },
            ],
          });
        } else if (
          message.method === "client/registerCapability" ||
          message.method === "client/unregisterCapability" ||
          message.method === "window/workDoneProgress/create"
        ) {
          this.send({ jsonrpc: "2.0", id: message.id, result: null });
        } else {
          this.send({
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code: -32601,
              message: `Method not found: ${message.method}`,
            },
          });
        }
        continue;
      }
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

  private waitForServerReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.serverReady = undefined;
        reject(new Error("Biome language server initialization timed out"));
      }, 5000);
      this.serverReady = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
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
    this.notify("textDocument/didSave", {
      textDocument: { uri: pathToFileURL(file).href },
      text: fs.readFileSync(file, "utf8"),
    });
  }

  private notify(method: string, params: unknown) {
    this.send({ jsonrpc: "2.0", method, params });
  }

  async open(file: string) {
    const uri = pathToFileURL(file).href;
    this.version++;
    this.diagnostics.delete(uri);
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
        languageId: languageId(file),
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
    const uri = pathToFileURL(file).href;
    if (!this.opened.has(uri)) await this.open(file);
    if (operation === "diagnostics") {
      if (this.pushDiagnostics) return this.waitForDiagnostics(uri);
      try {
        const result = (await this.request("textDocument/diagnostic", {
          textDocument: { uri },
        })) as { items?: LspDiagnostic[] } | null;
        return result?.items ?? [];
      } catch {
        return this.waitForDiagnostics(uri);
      }
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
    if (!method || !position) {
      throw new Error(`Unsupported LSP operation: ${operation}`);
    }
    if (operation === "references") {
      return this.request(method, {
        textDocument: { uri },
        position,
        context: { includeDeclaration: true },
      });
    }
    return this.request(method, { textDocument: { uri }, position });
  }

  private waitForDiagnostics(uri: string): Promise<LspDiagnostic[]> {
    if (this.diagnostics.has(uri))
      return Promise.resolve(this.diagnostics.get(uri)!);
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject };
      const waiters = this.diagnosticWaiters.get(uri) ?? [];
      waiters.push(waiter);
      this.diagnosticWaiters.set(uri, waiters);
      setTimeout(() => {
        const current = this.diagnosticWaiters.get(uri);
        if (!current?.includes(waiter)) return;
        this.diagnosticWaiters.set(
          uri,
          current.filter((item) => item !== waiter),
        );
        reject(
          new Error("Timed out waiting for textDocument/publishDiagnostics"),
        );
      }, 5000);
    });
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
