import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import yaml from "js-yaml";

const ISSUER = "https://auth.openai.com";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OAUTH_PORT = 1455;

export interface Creds {
  access: string;
  refresh: string;
  expires: number;
  account_id?: string;
}

export interface AuthState {
  kind: "api" | "oauth";
  apiKey?: string;
  access?: string;
  account_id?: string;
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

export function readCreds(): Creds | undefined {
  if (!fs.existsSync(configFile())) return undefined;
  const data = yaml.load(fs.readFileSync(configFile(), "utf8")) as Record<
    string,
    unknown
  >;
  const o = data.openai as Record<string, unknown> | undefined;
  if (!o || typeof o.access !== "string") return undefined;
  return {
    access: o.access,
    refresh: typeof o.refresh === "string" ? o.refresh : "",
    expires: Number(o.expires ?? 0),
    account_id: typeof o.account_id === "string" ? o.account_id : undefined,
  };
}

export function persistCreds(creds: Creds): void {
  const dir = path.dirname(configFile());
  fs.mkdirSync(dir, { recursive: true });
  const data = fs.existsSync(configFile())
    ? ((yaml.load(fs.readFileSync(configFile(), "utf8")) as Record<
        string,
        unknown
      >) ?? {})
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
      const claims = JSON.parse(
        Buffer.from(parts[1], "base64url").toString(),
      ) as Record<string, unknown>;
      const id =
        (claims.chatgpt_account_id as string | undefined) ??
        ((
          claims["https://api.openai.com/auth"] as
            | Record<string, unknown>
            | undefined
        )?.chatgpt_account_id as string | undefined) ??
        (claims.organizations as { id: string }[] | undefined)?.[0]?.id;
      if (id) return id;
    } catch {
      // Token is not a JWT.
    }
  }
  return undefined;
}

export async function exchangeCode(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<Creds> {
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
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const t = (await res.json()) as Record<string, unknown>;
  return {
    access: t.access_token as string,
    refresh: (t.refresh_token as string) ?? "",
    expires: Date.now() + ((t.expires_in as number | undefined) ?? 3600) * 1000,
    account_id: extractAccountId(t),
  };
}

export async function refreshCreds(refreshToken: string): Promise<Creds> {
  const res = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }).toString(),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  const t = (await res.json()) as Record<string, unknown>;
  return {
    access: t.access_token as string,
    refresh: (t.refresh_token as string) ?? "",
    expires: Date.now() + ((t.expires_in as number | undefined) ?? 3600) * 1000,
    account_id: extractAccountId(t),
  };
}

// redirect_uri must match the public client registration byte for byte
// (http://localhost:1455/auth/callback).
function parseCallback(
  url: URL,
  expectedState: string,
): { code?: string; error?: string } {
  if (url.pathname !== "/auth/callback") return { error: "not found" };
  const code = url.searchParams.get("code");
  const error =
    url.searchParams.get("error") ?? url.searchParams.get("error_description");
  if (error) return { error };
  if (!code || url.searchParams.get("state") !== expectedState)
    return { error: "invalid state" };
  return { code };
}

function openInBrowser(url: string): void {
  console.log("\nOpening a browser for ChatGPT login...");
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
): URLSearchParams {
  return new URLSearchParams({
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
}

function makeCallbackServer(o: {
  state: string;
  verifier: string;
  redirect: () => string;
  finish: (creds: Creds) => void;
  fail: (err: Error) => void;
}): http.Server {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
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
    exchangeCode(cb.code!, o.verifier, o.redirect()).then(o.finish, o.fail);
  });
  return server;
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
    const server = makeCallbackServer({
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
      fail(
        new Error(
          `could not open the callback server on port ${OAUTH_PORT}: ${e.message}`,
        ),
      );
    });
    server.listen(OAUTH_PORT, "localhost", () => {
      redirectUri = `http://localhost:${OAUTH_PORT}/auth/callback`;
      openInBrowser(
        `${ISSUER}/oauth/authorize?${authorizeParams(state, challenge, redirectUri).toString()}`,
      );
    });
  });
}
