import OpenAI from "openai";
import type { LlmCallOptions, LlmChunk, ProviderAdapter } from "@cagent/sdk";
import { fetchCodexModels } from "./codex";
import { pkceLogin, persistCreds, readCreds, refreshCreds, type AuthState } from "./oauth";
import { streamApi } from "./stream-api";
import { streamCodex } from "./stream-codex";

interface AdapterOptions {
  config: Record<string, unknown>;
  client?: OpenAI;
  auth?: AuthState;
}

function makeClient(apiKey: string, accountId?: string): OpenAI {
  return new OpenAI({
    apiKey,
    defaultHeaders: accountId ? { "ChatGPT-Account-Id": accountId } : {},
  });
}

function makeAuthResolver(opts: AdapterOptions): () => Promise<AuthState> {
  let authPromise: Promise<AuthState> | undefined;
  return () => {
    if (opts.auth) return opts.auth;
    if (opts.client) return Promise.resolve({ kind: "api", apiKey: "test" });
    authPromise ??= (async () => {
      const apiKey = (opts.config.api_key as string | undefined) ?? process.env.OPENAI_API_KEY;
      if (apiKey) return { kind: "api", apiKey };
      let creds = readCreds();
      if (creds && creds.expires > Date.now()) return { kind: "oauth", access: creds.access, account_id: creds.account_id };
      if (creds?.refresh) {
        try {
          creds = await refreshCreds(creds.refresh);
        } catch (e) {
          console.error("refresh failed, starting a new login:", e);
        }
      }
      if (!creds || creds.expires <= Date.now()) creds = await pkceLogin();
      persistCreds(creds);
      return { kind: "oauth", access: creds.access, account_id: creds.account_id };
    })();
    return authPromise;
  };
}

export function createAdapter(opts: AdapterOptions): ProviderAdapter {
  const getAuth = makeAuthResolver(opts);

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
      const model = options.model || (opts.config.model as string | undefined) || process.env.CAGENT_MODEL;
      if (!model) throw new Error("no model selected - set it in config, env CAGENT_MODEL, or /model");
      return { ...options, model };
    },

    async *stream(request: LlmCallOptions): AsyncGenerator<LlmChunk> {
      const auth = await getAuth();
      if (auth.kind === "api") {
        yield* streamApi(await getClient(), request);
        return;
      }
      yield* streamCodex(request, auth.access!, auth.account_id);
    },
  };
}
