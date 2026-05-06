import {
  InternalError,
  RateLimitError,
  ValidationError,
  toErrorResponse,
  type FactoryResponse,
} from '@latimer-woods-tech/errors';
import type { Logger } from '@latimer-woods-tech/logger';

/**
 * Single chat message exchanged with an LLM provider.
 */
export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Quality tier selected by the caller. Routing is workload-split:
 *  - `fast`      → Anthropic Haiku (short, latency-sensitive)
 *  - `balanced`  → Anthropic Sonnet (default)
 *  - `smart`     → Anthropic Opus OR Gemini 2.5 Pro if input is long-context (>150k tokens estimated)
 *  - `verifier`  → Groq Llama (cheap second opinion; only used from verifier code path)
 */
export type LLMTier = 'fast' | 'balanced' | 'smart' | 'verifier';

/**
 * Options that influence LLM completion behaviour.
 */
export interface LLMOptions {
  /** Quality tier; see {@link LLMTier}. Defaults to `balanced`. */
  tier?: LLMTier;
  /** Explicit model override. Takes precedence over tier. */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
  /** Token budget above which we force long-context routing (Gemini). */
  longContextThreshold?: number;
  /** Per-call cancellation signal. Aborts the in-flight provider request. */
  signal?: AbortSignal;
  /** Optional run identifier stamped on ledger rows + logs. */
  runId?: string;
  /** Optional project identifier stamped on ledger rows + logs. */
  project?: string;
  /** Optional actor identifier (supervisor / worker / human). */
  actor?: string;
  /** Anthropic prompt-cache control. Defaults to `true` for `system` prompts ≥ 1024 tokens. */
  promptCache?: boolean;
}

/**
 * Provider that produced an LLM response. `grok` removed in 0.3.0.
 */
export type LLMProvider = 'anthropic' | 'gemini' | 'groq' | 'grok';

/**
 * Result returned by a successful completion.
 */
export interface LLMResult {
  content: string;
  provider: LLMProvider;
  model: string;
  tier: LLMTier;
  tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
  latency: number;
  /** Number of attempts before success (1 = primary succeeded). */
  attempts: number;
  /** Monotonic request id from AI Gateway, if present in headers. */
  gatewayRequestId?: string;
}

/**
 * Environment bindings required by {@link complete}.
 *
 * `AI_GATEWAY_BASE_URL` is REQUIRED in 0.3.0. All provider calls flow through the
 * Cloudflare AI Gateway for unified logging, rate limiting, and cost telemetry.
 * In test/dev the caller may pass a custom fetch impl that short-circuits this.
 */
export interface LLMEnv {
  AI_GATEWAY_BASE_URL: string;
  ANTHROPIC_API_KEY: string;
  GROQ_API_KEY: string;
  /** Optional — only required when caller passes `{ model: 'grok-*' }` override. */
  GROK_API_KEY?: string;
  /**
   * Google Cloud short-lived access token with `aiplatform.endpoints.predict`.
   * Callers mint this via the JWT-bearer flow (service account → token exchange);
   * see `docs/runbooks/rotate-gcp-sa.md`. Token must be valid for ≥ 5 minutes.
   */
  VERTEX_ACCESS_TOKEN: string;
  VERTEX_PROJECT: string;
  VERTEX_LOCATION: string;
}

/**
 * Optional dependencies for {@link complete}.
 */
export interface LLMDeps {
  fetch?: typeof fetch;
  logger?: Logger;
  now?: () => number;
}

// Model catalogue — keep in sync with docs/architecture/FACTORY_V1.md § LLM substrate.
const MODELS = {
  anthropic: {
    fast: 'claude-haiku-4-5-20251001',
    balanced: 'claude-sonnet-4-6',
    smart: 'claude-opus-4-7',
  },
  gemini: {
    smart: 'gemini-2.5-pro',
  },
  groq: {
    verifier: 'llama-3.3-70b-versatile',
  },
  grok: {
    /** Opt-in only via `{ model: 'grok-*' }`. Not in default tier routing. */
    fast: 'grok-4-fast',
    mini: 'grok-3-mini-latest',
  },
} as const;

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_LONG_CONTEXT_THRESHOLD = 150_000; // tokens
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 250;

interface ProviderError {
  provider: LLMProvider;
  status: number;
  retryable: boolean;
  message: string;
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function estimateTokens(messages: LLMMessage[], system?: string): number {
  // Cheap estimator: ~4 chars/token. Good enough for threshold routing.
  let chars = system?.length ?? 0;
  for (const m of messages) chars += m.content.length;
  return Math.ceil(chars / 4);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

// ─── Provider request builders ─────────────────────────────────────────────

function buildAnthropicRequest(
  model: string,
  messages: LLMMessage[],
  opts: LLMOptions,
  env: LLMEnv,
): { url: string; headers: Record<string, string>; body: string } {
  const sys = opts.system ?? messages.find((m) => m.role === 'system')?.content;
  const filtered = messages.filter((m) => m.role !== 'system');
  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
    messages: filtered.map((m) => ({ role: m.role, content: m.content })),
  };
  if (sys) {
    const cache = opts.promptCache ?? sys.length >= 4096;
    body.system = cache
      ? [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }]
      : sys;
  }
  return {
    url: `${env.AI_GATEWAY_BASE_URL}/anthropic/v1/messages`,
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify(body),
  };
}

function buildGeminiRequest(
  model: string,
  messages: LLMMessage[],
  opts: LLMOptions,
  env: LLMEnv,
): { url: string; headers: Record<string, string>; body: string } {
  const sys = opts.system ?? messages.find((m) => m.role === 'system')?.content;
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
    },
  };
  if (sys) {
    body.systemInstruction = { parts: [{ text: sys }] };
  }
  const path = `v1/projects/${env.VERTEX_PROJECT}/locations/${env.VERTEX_LOCATION}/publishers/google/models/${model}:generateContent`;
  return {
    url: `${env.AI_GATEWAY_BASE_URL}/google-vertex-ai/${path}`,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.VERTEX_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(body),
  };
}

function buildGroqRequest(
  model: string,
  messages: LLMMessage[],
  opts: LLMOptions,
  env: LLMEnv,
): { url: string; headers: Record<string, string>; body: string } {
  const sys = opts.system ?? messages.find((m) => m.role === 'system')?.content;
  const merged: LLMMessage[] = [];
  if (sys) merged.push({ role: 'system', content: sys });
  for (const m of messages) if (m.role !== 'system') merged.push(m);
  return {
    url: `${env.AI_GATEWAY_BASE_URL}/groq/openai/v1/chat/completions`,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
      messages: merged,
    }),
  };
}

function buildGrokRequest(
  model: string,
  messages: LLMMessage[],
  opts: LLMOptions,
  env: LLMEnv,
): { url: string; headers: Record<string, string>; body: string } {
  if (!env.GROK_API_KEY) {
    throw new ValidationError('GROK_API_KEY required for grok-* model override');
  }
  const sys = opts.system ?? messages.find((m) => m.role === 'system')?.content;
  const merged: LLMMessage[] = [];
  if (sys) merged.push({ role: 'system', content: sys });
  for (const m of messages) if (m.role !== 'system') merged.push(m);
  return {
    url: `${env.AI_GATEWAY_BASE_URL}/grok/v1/chat/completions`,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.GROK_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: opts.temperature ?? DEFAULT_TEMPERATURE,
      messages: merged,
    }),
  };
}

// ─── Response parsers ──────────────────────────────────────────────────────

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model?: string;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

interface GroqResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}

function parseAnthropic(
  json: unknown,
): { content: string; input: number; output: number; cacheRead: number; cacheWrite: number; model?: string } {
  const r = json as AnthropicResponse;
  return {
    content: r.content?.find((c) => c.type === 'text')?.text ?? '',
    input: r.usage?.input_tokens ?? 0,
    output: r.usage?.output_tokens ?? 0,
    cacheRead: r.usage?.cache_read_input_tokens ?? 0,
    cacheWrite: r.usage?.cache_creation_input_tokens ?? 0,
    model: r.model,
  };
}

function parseGemini(json: unknown): { content: string; input: number; output: number } {
  const r = json as GeminiResponse;
  const text =
    r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return {
    content: text,
    input: r.usageMetadata?.promptTokenCount ?? 0,
    output: r.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

function parseGroq(json: unknown): { content: string; input: number; output: number; model?: string } {
  const r = json as GroqResponse;
  return {
    content: r.choices?.[0]?.message?.content ?? '',
    input: r.usage?.prompt_tokens ?? 0,
    output: r.usage?.completion_tokens ?? 0,
    model: r.model,
  };
}

// ─── Core call with backoff ────────────────────────────────────────────────

async function callWithBackoff(
  provider: LLMProvider,
  request: { url: string; headers: Record<string, string>; body: string },
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
  logger: Logger | undefined,
): Promise<{ json: unknown; gatewayRequestId?: string; attempts: number }> {
  let lastErr: ProviderError | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchImpl(request.url, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
        signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const err: ProviderError = {
          provider,
          status: response.status,
          retryable: isRetryable(response.status),
          message: `${provider} ${String(response.status)}: ${text.slice(0, 300)}`,
        };
        logger?.warn?.('llm.provider.error', { provider, status: response.status, attempt });
        if (!err.retryable || attempt === MAX_ATTEMPTS) throw err;
        lastErr = err;
      } else {
        const gatewayRequestId = response.headers.get('cf-aig-request-id') ?? undefined;
        return { json: await response.json(), gatewayRequestId, attempts: attempt };
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      if (typeof e === 'object' && e !== null && 'retryable' in e) {
        const err = e as ProviderError;
        if (!err.retryable || attempt === MAX_ATTEMPTS) throw err;
        lastErr = err;
      } else {
        const err: ProviderError = {
          provider,
          status: 0,
          retryable: true,
          message: e instanceof Error ? e.message : String(e),
        };
        if (attempt === MAX_ATTEMPTS) throw err;
        lastErr = err;
      }
    }
    const backoff = BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
    await sleep(backoff, signal);
  }
  throw lastErr ?? { provider, status: 0, retryable: false, message: 'exhausted' };
}

function isProviderError(err: unknown): err is ProviderError {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { status?: unknown }).status === 'number' &&
    typeof (err as { message?: unknown }).message === 'string' &&
    typeof (err as { provider?: unknown }).provider === 'string'
  );
}

// ─── Routing ───────────────────────────────────────────────────────────────

interface RoutePlan {
  primary: { provider: LLMProvider; model: string };
  fallback?: { provider: LLMProvider; model: string };
}

function plan(tier: LLMTier, opts: LLMOptions, tokenEstimate: number): RoutePlan {
  if (opts.model) {
    // Explicit override — best-effort provider detection.
    const m = opts.model;
    if (m.startsWith('claude')) return { primary: { provider: 'anthropic', model: m } };
    if (m.startsWith('gemini')) return { primary: { provider: 'gemini', model: m } };
    if (m.startsWith('grok')) return { primary: { provider: 'grok', model: m } };
    return { primary: { provider: 'groq', model: m } };
  }
  const longContext = tokenEstimate >= (opts.longContextThreshold ?? DEFAULT_LONG_CONTEXT_THRESHOLD);
  switch (tier) {
    case 'verifier':
      return { primary: { provider: 'groq', model: MODELS.groq.verifier } };
    case 'smart':
      return longContext
        ? {
            primary: { provider: 'gemini', model: MODELS.gemini.smart },
            fallback: { provider: 'anthropic', model: MODELS.anthropic.smart },
          }
        : {
            primary: { provider: 'anthropic', model: MODELS.anthropic.smart },
            fallback: { provider: 'gemini', model: MODELS.gemini.smart },
          };
    case 'fast':
      return { primary: { provider: 'anthropic', model: MODELS.anthropic.fast } };
    case 'balanced':
    default:
      return longContext
        ? {
            primary: { provider: 'gemini', model: MODELS.gemini.smart },
            fallback: { provider: 'anthropic', model: MODELS.anthropic.balanced },
          }
        : {
            primary: { provider: 'anthropic', model: MODELS.anthropic.balanced },
            fallback: { provider: 'gemini', model: MODELS.gemini.smart },
          };
  }
}

async function callOne(
  leg: { provider: LLMProvider; model: string },
  messages: LLMMessage[],
  opts: LLMOptions,
  env: LLMEnv,
  fetchImpl: typeof fetch,
  logger: Logger | undefined,
): Promise<{ parsed: { content: string; input: number; output: number; cacheRead?: number; cacheWrite?: number; model?: string }; gatewayRequestId?: string; attempts: number }> {
  let req: { url: string; headers: Record<string, string>; body: string };
  switch (leg.provider) {
    case 'anthropic':
      req = buildAnthropicRequest(leg.model, messages, opts, env);
      break;
    case 'gemini':
      req = buildGeminiRequest(leg.model, messages, opts, env);
      break;
    case 'groq':
      req = buildGroqRequest(leg.model, messages, opts, env);
      break;
    case 'grok':
      req = buildGrokRequest(leg.model, messages, opts, env);
      break;
  }
  const { json, gatewayRequestId, attempts } = await callWithBackoff(
    leg.provider,
    req,
    fetchImpl,
    opts.signal,
    logger,
  );
  switch (leg.provider) {
    case 'anthropic':
      return { parsed: parseAnthropic(json), gatewayRequestId, attempts };
    case 'gemini':
      return { parsed: parseGemini(json), gatewayRequestId, attempts };
    case 'groq':
      return { parsed: parseGroq(json), gatewayRequestId, attempts };
    case 'grok':
      return { parsed: parseGroq(json), gatewayRequestId, attempts };
  }
}

/**
 * Run a completion through the routing plan for the requested tier.
 *
 * Routing summary (0.3.0):
 *   - `fast`     → Anthropic Haiku
 *   - `balanced` → Anthropic Sonnet; Gemini 2.5 Pro if `longContextThreshold` exceeded
 *   - `smart`    → Anthropic Opus; Gemini 2.5 Pro if long-context
 *   - `verifier` → Groq Llama 3.3 70B (no fallback — verifier is inherently cheap/best-effort)
 *
 * All provider traffic flows through Cloudflare AI Gateway at `AI_GATEWAY_BASE_URL`.
 *
 * @param messages - Ordered chat history.
 * @param env - API key + gateway bindings.
 * @param opts - Optional tier/model/parameters override.
 * @param deps - Optional fetch/logger/clock injection (for testing).
 * @returns A {@link FactoryResponse} carrying either an {@link LLMResult} or
 *   an error (`LLM_ALL_PROVIDERS_FAILED`, `LLM_RATE_LIMITED`, or `INTERNAL_ERROR`).
 */
export async function complete(
  messages: LLMMessage[],
  env: LLMEnv,
  opts: LLMOptions = {},
  deps: LLMDeps = {},
): Promise<FactoryResponse<LLMResult>> {
  if (messages.length === 0) {
    throw new ValidationError('messages must not be empty');
  }
  if (!env.AI_GATEWAY_BASE_URL) {
    throw new ValidationError('AI_GATEWAY_BASE_URL is required in 0.3.0');
  }
  const fetchImpl = deps.fetch ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const logger = deps.logger;
  const startedAt = now();

  const tier: LLMTier = opts.tier ?? 'balanced';
  const system = opts.system ?? messages.find((m) => m.role === 'system')?.content;
  const tokenEstimate = estimateTokens(messages, system);
  const route = plan(tier, opts, tokenEstimate);

  const attempts: Array<{ provider: LLMProvider; status?: number; message: string }> = [];

  for (const leg of [route.primary, route.fallback].filter(Boolean) as Array<{ provider: LLMProvider; model: string }>) {
    try {
      const result = await callOne(leg, messages, opts, env, fetchImpl, logger);
      if (!result.parsed.content) {
        throw { provider: leg.provider, status: 200, retryable: false, message: 'empty content' } satisfies ProviderError;
      }
      logger?.info?.('llm.complete', {
        provider: leg.provider,
        model: leg.model,
        tier,
        tokenEstimate,
        attempts: result.attempts,
        runId: opts.runId,
        project: opts.project,
        actor: opts.actor,
      });
      return {
        data: {
          content: result.parsed.content,
          provider: leg.provider,
          model: result.parsed.model ?? leg.model,
          tier,
          tokens: {
            input: result.parsed.input,
            output: result.parsed.output,
            cacheRead: result.parsed.cacheRead,
            cacheWrite: result.parsed.cacheWrite,
          },
          latency: now() - startedAt,
          attempts: result.attempts,
          gatewayRequestId: result.gatewayRequestId,
        },
        error: null,
      };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return toErrorResponse(
          new InternalError('llm call aborted', { provider: leg.provider, model: leg.model }),
        );
      }
      if (isProviderError(e)) {
        attempts.push({ provider: e.provider, status: e.status, message: e.message });
        if (e.status === 429 && !route.fallback) {
          return toErrorResponse(
            new RateLimitError(`llm rate limited on ${e.provider}`, { attempts }),
          );
        }
        logger?.warn?.('llm.leg.failed', { provider: leg.provider, status: e.status });
        continue;
      }
      attempts.push({ provider: leg.provider, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return toErrorResponse(
    new InternalError('LLM_ALL_PROVIDERS_FAILED', { attempts, tier, tokenEstimate }),
  );
}

export { MODELS };
