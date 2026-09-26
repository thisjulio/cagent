import Anthropic from "@anthropic-ai/sdk";
import {
  noopObservability,
  type LlmCallOptions,
  type LlmChunk,
  type Observability,
  type ProviderAdapter,
} from "@cagent/sdk";
import {
  ensureDeviceId,
  pkceLogin,
  persistCreds,
  readCreds,
  refreshCreds,
  session_id,
  type AuthState,
} from "./oauth";
import { streamMessages } from "./stream";

interface AdapterOptions {
  config: Record<string, unknown>;
  client?: Anthropic;
  observability?: Observability;
}

function apiKeyFrom(config: Record<string, unknown>): string | undefined {
  return (
    (config.api_key as string | undefined) ?? process.env.ANTHROPIC_API_KEY
  );
}

function baseUrlFrom(config: Record<string, unknown>): string {
  return (
    (config.base_url as string | undefined) ??
    process.env.ANTHROPIC_BASE_URL ??
    "https://api.anthropic.com"
  ).replace(/\/$/, "");
}

function maxTokensFrom(config: Record<string, unknown>): number {
  const value = Number(
    (config.max_tokens as string | number | undefined) ??
      process.env.ANTHROPIC_MAX_TOKENS ??
      8192,
  );
  return Number.isFinite(value) && value > 0 ? value : 8192;
}

function makeAuthResolver(opts: AdapterOptions): () => Promise<AuthState> {
  let authPromise: Promise<AuthState> | undefined;
  return () => {
    if (opts.config.auth) return Promise.resolve(opts.config.auth as AuthState);
    authPromise ??= (async () => {
      const apiKey = apiKeyFrom(opts.config);
      if (apiKey) return { kind: "api", apiKey };
      let creds = readCreds();
      if (creds && creds.expires > Date.now())
        return {
          kind: "oauth",
          access: creds.access,
          accountUuid: creds.accountUuid,
        };
      if (creds?.refresh) {
        try {
          creds = await refreshCreds(creds.refresh);
        } catch (e) {
          console.error("anthropic: refresh failed, starting a new login:", e);
        }
      }
      if (!creds || creds.expires <= Date.now()) creds = await pkceLogin();
      persistCreds(creds);
      return {
        kind: "oauth",
        access: creds.access,
        accountUuid: creds.accountUuid,
      };
    })();
    return authPromise;
  };
}

export function createAdapter(opts: AdapterOptions): ProviderAdapter {
  const getAuth = makeAuthResolver(opts);
  const observability = opts.observability ?? noopObservability;

  // ponytail: the server cross-checks the OAuth bearer against identity
  // signals (metadata.user_id.account_uuid, X-Claude-Code-Session-Id, x-app)
  // to route the request to the subscription bucket. Without them the token
  // is treated as third-party and routed to extra-usage (the fake 429).
  const makeClient = (auth: AuthState): Anthropic => {
    const clientOptions: ConstructorParameters<typeof Anthropic>[0] = {
      baseURL: baseUrlFrom(opts.config),
    };
    if (auth.kind === "api" && auth.apiKey) clientOptions.apiKey = auth.apiKey;
    else if (auth.access) {
      clientOptions.authToken = auth.access;
      clientOptions.defaultHeaders = {
        "anthropic-beta": "oauth-2025-04-20",
        "x-app": "cli",
        "X-Claude-Code-Session-Id": session_id,
      };
    }
    return opts.client ?? new Anthropic(clientOptions);
  };

  return {
    estimate_tokens(_model: string, messages) {
      const content = messages.reduce(
        (total, message) =>
          total +
          (typeof message.content === "string"
            ? message.content.length
            : message.content
                .map((part) => (part.type === "text" ? part.text.length : 200))
                .reduce((a, b) => a + b, 0)),
        0,
      );
      return Math.ceil(content / 4);
    },

    async list_models(): Promise<string[]> {
      const client = makeClient(await getAuth());
      const ids: string[] = [];
      for await (const model of client.models.list()) ids.push(model.id);
      return ids.sort();
    },

    async supported_variants(model: string): Promise<string[]> {
      return /claude-(?:sonnet|opus)-[45]/i.test(model) &&
        !model.toLowerCase().includes("claude-3-")
        ? ["low", "medium", "high", "max"]
        : [];
    },

    async prepare_call(options: LlmCallOptions): Promise<LlmCallOptions> {
      const model =
        options.model ||
        (opts.config.model as string | undefined) ||
        process.env.CAGENT_MODEL;
      if (!model)
        throw new Error(
          "no model selected - set it in config, env CAGENT_MODEL, or /model",
        );
      return { ...options, model };
    },

    async *stream(request: LlmCallOptions): AsyncGenerator<LlmChunk> {
      const auth = await getAuth();
      const client = makeClient(auth);
      const userId =
        auth.kind === "oauth"
          ? JSON.stringify({
              device_id: ensureDeviceId(),
              account_uuid: auth.accountUuid ?? "",
              session_id,
            })
          : undefined;
      yield* streamMessages(client, request, {
        max_tokens: maxTokensFrom(opts.config),
        metadata: userId ? { user_id: userId } : undefined,
        observability,
      });
    },
  };
}
