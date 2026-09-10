import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import yaml from "js-yaml";
import OpenAI from "openai";
import type { LlmCallOptions, LlmChunk, Plugin, ProviderAdapter } from "@cagent/sdk";

const ISSUER = "https://auth.openai.com";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OAUTH_PORT = 1455;
const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";


interface Creds {
  access: string;
  refresh: string;
  expires: number;
  account_id?: string;
}

interface AdapterOptions {
  config: Record<string, unknown>;
  client?: OpenAI;
  auth?: AuthState;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(43)))
    .map((b) => chars[b % chars.length])
    .join("");
  const challenge = base64UrlEncode(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

function configFile(): string {
  return path.join(os.homedir(), ".cagent", "config.yml");
}

function readCreds(): Creds | undefined {
  if (!fs.existsSync(configFile())) return undefined;
  const data = yaml.load(fs.readFileSync(configFile(), "utf8")) as Record<string, unknown>;
  const o = data.openai as Record<string, unknown> | undefined;
  if (!o || typeof o.access !== "string") return undefined;
  return {
    access: o.access,
    refresh: typeof o.refresh === "string" ? o.refresh : "",
    expires: Number(o.expires ?? 0),
    account_id: typeof o.account_id === "string" ? o.account_id : undefined,
  };
}

function persistCreds(creds: Creds): void {
  const dir = path.dirname(configFile());
  fs.mkdirSync(dir, { recursive: true });
  const data = fs.existsSync(configFile())
    ? ((yaml.load(fs.readFileSync(configFile(), "utf8")) as Record<string, unknown>) ?? {})
    : {};
  data.openai = {
    access: creds.access,
    refresh: creds.refresh,
    expires: creds.expires,
    ...(creds.account_id ? { account_id: creds.account_id } : {}),
  };
  fs.writeFileSync(configFile(), yaml.dump(data));
}

function extractAccountId(tokens: Record<string, unknown>): string | undefined {
  for (const key of ["id_token", "access_token"]) {
    const token = tokens[key] as string | undefined;
    if (!token) continue;
    const parts = token.split(".");
    if (parts.length !== 3) continue;
    try {
      const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as Record<string, unknown>;
      const id =
        (claims.chatgpt_account_id as string | undefined) ??
        ((claims["https://api.openai.com/auth"] as Record<string, unknown> | undefined)?.chatgpt_account_id as
          | string
          | undefined) ??
        ((claims.organizations as { id: string }[] | undefined)?.[0]?.id);
      if (id) return id;
    } catch {
      // token não é JWT
    }
  }
  return undefined;
}

async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<Creds> {
  const res = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }).toString(),
  });
  if (!res.ok) throw new Error(`troca de token falhou: ${res.status}`);
  const t = (await res.json()) as Record<string, unknown>;
  return {
    access: t.access_token as string,
    refresh: (t.refresh_token as string) ?? "",
    expires: Date.now() + ((t.expires_in as number | undefined) ?? 3600) * 1000,
    account_id: extractAccountId(t),
  };
}

async function refreshCreds(refreshToken: string): Promise<Creds> {
  const res = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
  });
  if (!res.ok) throw new Error(`refresh de token falhou: ${res.status}`);
  const t = (await res.json()) as Record<string, unknown>;
  return {
    access: t.access_token as string,
    refresh: (t.refresh_token as string) ?? "",
    expires: Date.now() + ((t.expires_in as number | undefined) ?? 3600) * 1000,
    account_id: extractAccountId(t),
  };
}

async function pkceLogin(): Promise<Creds> {
  const { verifier, challenge } = await generatePKCE();
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)).buffer);

  return new Promise<Creds>((resolve, reject) => {
    let done = false;
    const finish = (creds: Creds) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      server.close();
      resolve(creds);
    };
    const fail = (err: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      server.close();
      reject(err);
    };

    let redirectUri = "";
    const server = http.createServer((req, res) => {
      // o redirect_uri deve bater byte a byte com o registrado para o client público
      // (http://localhost:1455/auth/callback)
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== "/auth/callback") {
        res.writeHead(404);
        res.end("não encontrado");
        return;
      }
      const code = url.searchParams.get("code");
      const cbState = url.searchParams.get("state");
      const error = url.searchParams.get("error") ?? url.searchParams.get("error_description");
      if (error) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`erro: ${error}`);
        fail(new Error(error));
        return;
      }
      if (!code || cbState !== state) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("estado inválido — possível ataque CSRF");
        fail(new Error("state inválido"));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Login concluído. Esta página pode ser fechada.");
      exchangeCode(code, verifier, redirectUri).then(finish, fail);
    });

    const timer = setTimeout(() => fail(new Error("timeout: o callback do browser não chegou em 5 min")), 5 * 60 * 1000);

    server.on("error", (e: Error) => {
      fail(new Error(`não foi possível abrir o servidor de callback na porta ${OAUTH_PORT}: ${e.message}`));
    });
    server.listen(OAUTH_PORT, "localhost", () => {
      redirectUri = `http://localhost:${OAUTH_PORT}/auth/callback`;
      const params = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        scope: "openid profile email offline_access",
        code_challenge: challenge,
        code_challenge_method: "S256",
        id_token_add_organizations: "true",
        codex_cli_simplified_flow: "true",
        state,
        originator: "cagent",
      });
      const authorizeUrl = `${ISSUER}/oauth/authorize?${params.toString()}`;
      console.log("\nAbrindo browser para login no ChatGPT...");
      for (const cmd of ["xdg-open", "open", "wslview"]) {
        try {
          spawn(cmd, [authorizeUrl], { stdio: "ignore" });
          break;
        } catch {
          // tenta o próximo opener
        }
      }
      console.log(`Se o browser não abriu, use: ${authorizeUrl}`);
    });
  });
}

function makeClient(apiKey: string, accountId?: string): OpenAI {
  return new OpenAI({
    apiKey,
    defaultHeaders: accountId ? { "ChatGPT-Account-Id": accountId } : {},
  });
}

export interface AuthState {
  kind: "api" | "oauth";
  apiKey?: string;
  access?: string;
  account_id?: string;
}

// catálogo de modelos do token ChatGPT vem do backend Codex, não do /v1/models público
export async function fetchCodexModels(access: string, accountId?: string): Promise<string[]> {
  const res = await fetch("https://chatgpt.com/backend-api/codex/models?client_version=1.0.0", {
    headers: {
      authorization: `Bearer ${access}`,
      ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
    },
  });
  if (!res.ok) throw new Error(`listagem de modelos falhou: ${res.status}`);
  const data = (await res.json()) as { models: { id?: string; slug?: string }[] };
  return data.models.map((m) => m.id ?? m.slug).filter((s) => s).sort();
}

function jwtClaims(token: string): Record<string, unknown> | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString()) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function extractResidency(token: string): string | undefined {
  const claims = jwtClaims(token);
  const r =
    (claims?.["https://api.openai.com/auth"] as Record<string, unknown> | undefined)?.chatgpt_compute_residency ??
    (claims?.chatgpt_compute_residency as string | undefined);
  return r && r !== "no_constraint" ? r : undefined;
}

function toInputItems(messages: LlmCallOptions["messages"]): unknown[] {
  const items: unknown[] = [];
  for (const m of messages) {
    if (m.role === "assistant") {
      if (m.content) items.push({ type: "message", role: m.role, content: [{ type: "input_text", text: m.content }] });
      for (const tc of m.tool_calls ?? []) {
        items.push({ type: "function_call", name: tc.name, arguments: tc.arguments, call_id: tc.id });
      }
    } else if (m.role === "tool") {
      items.push({
        type: "function_call_output",
        call_id: m.tool_call_id ?? "",
        output: m.content ?? "",
      });
    } else {
      items.push({ type: "message", role: m.role, content: [{ type: "input_text", text: m.content ?? "" }] });
    }
  }
  return items;
}

export function createAdapter(opts: AdapterOptions): ProviderAdapter {
  const { config } = opts;
  let authPromise: Promise<AuthState> | undefined;

  const getAuth = async (): Promise<AuthState> => {
    if (opts.auth) return opts.auth;
    if (opts.client) return { kind: "api", apiKey: "test" };
    authPromise ??= (async () => {
      const apiKey = (config.api_key as string | undefined) ?? process.env.OPENAI_API_KEY;
      if (apiKey) return { kind: "api", apiKey };

      let creds = readCreds();
      if (creds && creds.expires > Date.now()) return { kind: "oauth", access: creds.access, account_id: creds.account_id };
      if (creds?.refresh) {
        try {
          creds = await refreshCreds(creds.refresh);
        } catch (e) {
          console.error("refresh falhou, fazendo login novo:", e);
        }
      }
      if (!creds || creds.expires <= Date.now()) creds = await pkceLogin();
      persistCreds(creds);
      return { kind: "oauth", access: creds.access, account_id: creds.account_id };
    })();
    return authPromise;
  };

  const getClient = async (): Promise<OpenAI> => {
    if (opts.client) return opts.client;
    const auth = await getAuth();
    return makeClient(auth.access ?? auth.apiKey ?? "", auth.account_id);
  };

  return {
    async list_models(): Promise<string[]> {
      const auth = await getAuth();
      if (auth.kind === "api") {
        const res = await (await getClient()).models.list();
        return res.data.map((m) => m.id).sort();
      }
      return fetchCodexModels(auth.access!, auth.account_id);
    },

    async prepare_call(options: LlmCallOptions): Promise<LlmCallOptions> {
      const model = options.model || (config.model as string | undefined) || process.env.CAGENT_MODEL;
      if (!model) throw new Error("modelo não selecionado — defina via config, env CAGENT_MODEL ou /model");
      return { ...options, model };
    },

    async *stream(request: LlmCallOptions): AsyncGenerator<LlmChunk> {
      const auth = await getAuth();
      if (auth.kind === "api") {
        const client = await getClient();
        const res = await client.chat.completions.create({
          model: request.model,
          messages: request.messages,
          tools: request.tools.length
            ? request.tools.map((t) => ({
                type: "function",
                function: { name: t.name, description: t.description, parameters: t.parameters },
              }))
            : undefined,
          stream: true,
          stream_options: { include_usage: true },
        });
        let finish = "stop";
        let usage: { input_tokens: number; output_tokens: number } | undefined;
        const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
        for await (const chunk of res) {
          const choice = chunk.choices[0];
          const delta = choice?.delta;
          if (delta?.content) yield { type: "text", text: delta.content };
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const cur = toolCalls.get(tc.index) ?? { id: "", name: "", arguments: "" };
              if (tc.id) cur.id = tc.id;
              if (tc.function?.name) cur.name += tc.function.name;
              if (tc.function?.arguments) cur.arguments += tc.function.arguments;
              toolCalls.set(tc.index, cur);
            }
          }
          if (choice?.finish_reason) {
            finish = choice.finish_reason;
            for (const tc of toolCalls.values()) yield { type: "tool-call", tool_call: tc };
            toolCalls.clear();
          }
          if (chunk.usage) {
            usage = { input_tokens: chunk.usage.prompt_tokens, output_tokens: chunk.usage.completion_tokens };
          }
        }
        yield { type: "finish", finish_reason: finish, usage };
        return;
      }

      const headers: Record<string, string> = {
        authorization: `Bearer ${auth.access}`,
        "content-type": "application/json",
      };
      if (auth.account_id) headers["ChatGPT-Account-Id"] = auth.account_id;
      const residency = extractResidency(auth.access);
      if (residency) headers["x-openai-internal-codex-residency"] = residency;

      const systemMsg = request.messages.find((m) => m.role === "system");
      const res = await fetch(CODEX_RESPONSES_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: request.model,
          instructions: systemMsg?.content ?? "",
          input: toInputItems(request.messages.filter((m) => m.role !== "system")),
          tool_choice: "auto",
          stream: true,
          store: false,
          ...(request.tools.length
            ? {
                tools: request.tools.map((t) => ({
                  type: "function",
                  name: t.name,
                  description: t.description,
                  parameters: t.parameters,
                  strict: false,
                })),
              }
            : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(`stream falhou: ${res.status} ${text}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finish = "stop";
      let usage: { input_tokens: number; output_tokens: number } | undefined;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx = buf.indexOf("\n\n");
        while (idx !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const event = block.split("\n").find((l) => l.startsWith("event:"))?.slice(7).trim();
          const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
          if (event && dataLine) {
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(dataLine.slice(5).trim());
            } catch {
              continue;
            }
            if (event === "response.output_text.delta") {
              yield { type: "text", text: String(data.delta ?? "") };
            } else if (event === "response.output_item.done") {
              const item = data.item as Record<string, unknown> | undefined;
              if (item && item.type === "function_call") {
                yield {
                  type: "tool-call",
                  tool_call: {
                    id: String(item.call_id ?? item.id ?? ""),
                    name: String(item.name ?? ""),
                    arguments: String(item.arguments ?? ""),
                  },
                };
              }
            } else if (event === "response.completed") {
              const r = data.response as Record<string, unknown> | undefined;
              const u = r?.usage as { input_tokens?: number; output_tokens?: number } | undefined;
              if (u) usage = { input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0 };
              finish = String(r?.status ?? "stop");
            }
          }
          idx = buf.indexOf("\n\n");
        }
      }
      yield { type: "finish", finish_reason: finish, usage };
    },
  };
}

const register: Plugin = (ctx) => {
  ctx.registerProvider("openai", createAdapter({ config: ctx.config }));
};

export default register;
