import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import yaml from "js-yaml";

// Claude AI OAuth (login via browser). Endpoints and client_id mirror the
// public Claude Code CLI registration; the token works as a bearer on the
// native Anthropic Messages API.
const AUTHORIZE_URL = "https://claude.com/cai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const SCOPES = "user:inference user:profile";

export interface Creds {
  access: string;
  refresh: string;
  expires: number;
  accountUuid?: string;
}

export interface AuthState {
  kind: "api" | "oauth";
  apiKey?: string;
  access?: string;
  accountUuid?: string;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generatePKCE(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const limit = Math.floor(256 / chars.length) * chars.length;
  const bytes: number[] = [];
  while (bytes.length < 43) {
    for (const byte of crypto.getRandomValues(new Uint8Array(43))) {
      if (byte < limit) bytes.push(byte % chars.length);
      if (bytes.length === 43) break;
    }
  }
  const verifier = bytes.map((byte) => chars[byte]).join("");
  const challenge = base64UrlEncode(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  return { verifier, challenge };
}

function configFile(): string {
  return path.join(os.homedir(), ".cagent", "config.yml");
}

function readConfigFile(): Record<string, unknown> {
  if (!fs.existsSync(configFile())) return {};
  const data = yaml.load(fs.readFileSync(configFile(), "utf8")) as Record<
    string,
    unknown
  >;
  return data ?? {};
}

// ponytail: device_id is a stable per-machine identifier, persisted so every
// request from this host presents the same identity to the Anthropic
// billing validator. Stored under the `anthropic` config key, separate from
// the token fields.
export function ensureDeviceId(): string {
  const o = readConfigFile().anthropic as Record<string, unknown> | undefined;
  const existing = o?.device_id;
  if (typeof existing === "string" && existing.length > 0) return existing;
  const generated = crypto
    .getRandomValues(new Uint8Array(32))
    .reduce((hex, byte) => hex + byte.toString(16).padStart(2, "0"), "");
  const data = readConfigFile();
  data.anthropic = { ...(o ?? {}), device_id: generated };
  fs.writeFileSync(configFile(), yaml.dump(data));
  return generated;
}

// ponytail: session_id is stable for the life of one process (one chat
// session) and is paired with the X-Claude-Code-Session-Id header so the
// server can tie the request to a single Claude Code session.
export const session_id = crypto
  .getRandomValues(new Uint8Array(16))
  .reduce((hex, byte) => hex + byte.toString(16).padStart(2, "0"), "")
  .toUpperCase();

export function readCreds(): Creds | undefined {
  if (!fs.existsSync(configFile())) return undefined;
  const data = yaml.load(fs.readFileSync(configFile(), "utf8")) as Record<
    string,
    unknown
  >;
  const o = data.anthropic as Record<string, unknown> | undefined;
  if (!o || typeof o.access !== "string") return undefined;
  return {
    access: o.access,
    refresh: typeof o.refresh === "string" ? o.refresh : "",
    expires: Number(o.expires ?? 0),
    accountUuid:
      typeof o.account_uuid === "string" ? o.account_uuid : undefined,
  };
}

export function persistCreds(creds: Creds): void {
  const dir = path.dirname(configFile());
  fs.mkdirSync(dir, { recursive: true });
  const existing = readConfigFile().anthropic as
    | Record<string, unknown>
    | undefined;
  const data = {
    ...readConfigFile(),
    anthropic: {
      ...(existing ?? {}),
      access: creds.access,
      refresh: creds.refresh,
      expires: creds.expires,
      account_uuid: creds.accountUuid,
    },
  };
  fs.writeFileSync(configFile(), yaml.dump(data));
}

export async function exchangeCode(
  code: string,
  verifier: string,
  redirectUri: string,
  state: string,
): Promise<Creds> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      state,
      redirect_uri: redirectUri,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `token exchange failed: ${res.status} ${text.slice(0, 500)}`,
    );
  }
  const t = (await res.json()) as Record<string, unknown>;
  return {
    access: t.access_token as string,
    refresh: (t.refresh_token as string) ?? "",
    expires: Date.now() + ((t.expires_in as number | undefined) ?? 3600) * 1000,
    accountUuid: accountUuidFromToken(t),
  };
}

// ponytail: the OAuth token response embeds the account UUID, which the
// server cross-checks against metadata.user_id.account_uuid; without a
// match the request is routed to the extra-usage bucket (the fake 429).
function accountUuidFromToken(t: Record<string, unknown>): string | undefined {
  const account = t.account as Record<string, unknown> | undefined;
  return typeof account?.uuid === "string" ? account.uuid : undefined;
}

export async function refreshCreds(refreshToken: string): Promise<Creds> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      scope: SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  const t = (await res.json()) as Record<string, unknown>;
  return {
    access: t.access_token as string,
    refresh: (t.refresh_token as string) ?? "",
    expires: Date.now() + ((t.expires_in as number | undefined) ?? 3600) * 1000,
    accountUuid: accountUuidFromToken(t),
  };
}

function parseCallback(
  url: URL,
  expectedState: string,
): { code?: string; error?: string } {
  if (url.pathname !== "/callback") return { error: "not found" };
  const code = url.searchParams.get("code");
  const error =
    url.searchParams.get("error") ?? url.searchParams.get("error_description");
  if (error) return { error };
  if (!code || url.searchParams.get("state") !== expectedState)
    return { error: "invalid state" };
  return { code };
}

function openInBrowser(url: string): void {
  console.log("\nOpening a browser for Claude login...");
  for (const cmd of ["xdg-open", "open", "wslview"]) {
    try {
      spawn(cmd, [url], { stdio: "ignore" });
      break;
    } catch {
      // Try the next opener.
    }
  }
  console.log(`If the browser did not open, use: ${url}`);
}

function authorizeParams(
  state: string,
  challenge: string,
  redirectUri: string,
): string {
  const params = new URLSearchParams({
    code: "true",
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

function makeCallbackServer(o: {
  state: string;
  verifier: string;
  redirect: () => string;
  finish: (creds: Creds) => void;
  fail: (err: Error) => void;
}): { server: http.Server; port: () => number } {
  let port = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const cb = parseCallback(url, o.state);
    if (cb.error === "not found") {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    if (cb.error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`error: ${cb.error}`);
      o.fail(new Error(cb.error));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Login complete. You can close this page.");
    exchangeCode(cb.code!, o.verifier, o.redirect(), o.state).then(
      o.finish,
      o.fail,
    );
  });
  return {
    server,
    port: () => (server.address() as { port: number }).port,
  };
}

export async function pkceLogin(): Promise<Creds> {
  const { verifier, challenge } = await generatePKCE();
  const state = base64UrlEncode(
    crypto.getRandomValues(new Uint8Array(32)).buffer,
  );
  return new Promise<Creds>((resolve, reject) => {
    let done = false;
    let redirectUri = "";
    const finish = (creds: Creds) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        server.close();
        resolve(creds);
      }
    };
    const fail = (err: Error) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        server.close();
        reject(err);
      }
    };
    const { server, port } = makeCallbackServer({
      state,
      verifier,
      redirect: () => redirectUri,
      finish,
      fail,
    });
    const timer = setTimeout(
      () =>
        fail(
          new Error(
            "timeout: the browser callback did not arrive within 5 minutes",
          ),
        ),
      5 * 60 * 1000,
    );
    server.on("error", (e: Error) => {
      fail(new Error(`could not open the callback server: ${e.message}`));
    });
    // port 0 lets the OS pick a free port, avoiding collisions with other
    // providers' fixed ports.
    server.listen(0, "localhost", () => {
      const p = port();
      redirectUri = `http://localhost:${p}/callback`;
      openInBrowser(authorizeParams(state, challenge, redirectUri));
    });
  });
}
