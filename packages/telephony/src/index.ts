import {
  ErrorCodes,
  FactoryBaseError,
  InternalError,
  ValidationError,
  type FactoryResponse,
} from '@latimer-woods-tech/errors';
import { complete as llmComplete, type LLMEnv, type LLMMessage } from '@latimer-woods-tech/llm';
import type { Logger } from '@latimer-woods-tech/logger';

/**
 * Configuration for a {@link VoiceSession}.
 */
export interface VoiceSessionConfig {
  callId: string;
  direction: 'inbound' | 'outbound';
  voiceId: string;
  language?: string;
  systemPrompt: string;
  env: {
    TELNYX_API_KEY: string;
    DEEPGRAM_API_KEY: string;
    ELEVENLABS_API_KEY: string;
    AI_GATEWAY_BASE_URL: string;
    ANTHROPIC_API_KEY: string;
    GROQ_API_KEY: string;
    VERTEX_ACCESS_TOKEN: string;
    VERTEX_PROJECT: string;
    VERTEX_LOCATION: string;
  };
}

/**
 * Single utterance recorded during a {@link VoiceSession}.
 */
export interface Transcript {
  speaker: 'user' | 'agent';
  text: string;
  ts: number;
  duration: number;
}

/**
 * Optional dependencies for telephony helpers — primarily for testing.
 */
export interface TelephonyDeps {
  fetch?: typeof fetch;
  logger?: Logger;
  now?: () => number;
}

/**
 * Options accepted by {@link transcribe}.
 */
export interface TranscribeOptions {
  language?: string;
  model?: string;
}

/**
 * Options accepted by {@link synthesize}.
 */
export interface SynthesizeOptions {
  stability?: number;
  similarityBoost?: number;
  /** AbortSignal for cancelling the underlying ElevenLabs request (e.g. AbortSignal.timeout). */
  signal?: AbortSignal;
}

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string }>;
    }>;
  };
}

interface TelnyxWebhookPayload {
  data?: {
    event_type?: string;
    payload?: {
      call_control_id?: string;
      call_leg_id?: string;
    };
  };
}

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen';
const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const DEFAULT_LANGUAGE = 'en-US';
const DEFAULT_DEEPGRAM_MODEL = 'nova-2';
const DEFAULT_STABILITY = 0.5;
const DEFAULT_SIMILARITY = 0.75;

/**
 * Transcribes raw audio bytes via Deepgram and returns the best transcript.
 */
export async function transcribe(
  audio: ArrayBuffer,
  apiKey: string,
  opts: TranscribeOptions = {},
  deps: TelephonyDeps = {},
): Promise<string> {
  if (!apiKey) {
    throw new ValidationError('Deepgram API key is required');
  }
  if (audio.byteLength === 0) {
    throw new ValidationError('Audio payload must not be empty');
  }
  const fetchImpl = deps.fetch ?? fetch;
  const language = opts.language ?? DEFAULT_LANGUAGE;
  const model = opts.model ?? DEFAULT_DEEPGRAM_MODEL;
  const url = `${DEEPGRAM_URL}?language=${encodeURIComponent(language)}&model=${encodeURIComponent(model)}`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/octet-stream',
      },
      body: audio,
    });
  } catch (err) {
    throw new FactoryBaseError(
      ErrorCodes.TELEPHONY_STT_FAILED,
      `Deepgram request failed: ${(err as Error).message}`,
      502,
      true,
    );
  }
  if (!response.ok) {
    const detail = await safeText(response);
    throw new FactoryBaseError(
      ErrorCodes.TELEPHONY_STT_FAILED,
      `Deepgram returned ${String(response.status)}: ${detail}`,
      502,
      true,
      { status: response.status },
    );
  }
  const json = (await response.json()) as DeepgramResponse;
  const transcript = json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
  return transcript;
}

/**
 * Synthesises speech audio via ElevenLabs.
 */
export async function synthesize(
  text: string,
  voiceId: string,
  apiKey: string,
  opts: SynthesizeOptions = {},
  deps: TelephonyDeps = {},
): Promise<ArrayBuffer> {
  if (!apiKey) {
    throw new ValidationError('ElevenLabs API key is required');
  }
  if (!voiceId) {
    throw new ValidationError('voiceId is required');
  }
  if (text.length === 0) {
    throw new ValidationError('text must not be empty');
  }
  const fetchImpl = deps.fetch ?? fetch;
  const url = `${ELEVENLABS_URL}/${encodeURIComponent(voiceId)}`;
  const body = JSON.stringify({
    text,
    voice_settings: {
      stability: opts.stability ?? DEFAULT_STABILITY,
      similarity_boost: opts.similarityBoost ?? DEFAULT_SIMILARITY,
    },
  });
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body,
    });
  } catch (err) {
    throw new FactoryBaseError(
      ErrorCodes.TELEPHONY_TTS_FAILED,
      `ElevenLabs request failed: ${(err as Error).message}`,
      502,
      true,
    );
  }
  if (!response.ok) {
    const detail = await safeText(response);
    throw new FactoryBaseError(
      ErrorCodes.TELEPHONY_TTS_FAILED,
      `ElevenLabs returned ${String(response.status)}: ${detail}`,
      502,
      true,
      { status: response.status },
    );
  }
  return await response.arrayBuffer();
}

/**
 * Acknowledges a Telnyx webhook event with a 200 response.
 */
export async function handleTelnyxWebhook(
  request: Request,
  apiKey: string,
): Promise<Response> {
  if (!apiKey) {
    throw new ValidationError('Telnyx API key is required');
  }
  let payload: TelnyxWebhookPayload;
  try {
    payload = (await request.json()) as TelnyxWebhookPayload;
  } catch {
    return Response.json(
      { ok: false, error: 'invalid_json' },
      { status: 400 },
    );
  }
  const eventType = payload.data?.event_type ?? 'unknown';
  const callControlId = payload.data?.payload?.call_control_id ?? null;
  return Response.json(
    { ok: true, event: eventType, callControlId },
    { status: 200 },
  );
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '<unreadable body>';
  }
}

/**
 * Long-lived voice conversation that ties STT, LLM, and TTS together.
 */
export class VoiceSession extends EventTarget {
  private readonly config: VoiceSessionConfig;
  private readonly deps: TelephonyDeps;
  private readonly transcripts: Transcript[] = [];
  private readonly history: LLMMessage[] = [];
  private started = false;
  private ended = false;

  public constructor(config: VoiceSessionConfig, deps: TelephonyDeps = {}) {
    super();
    if (!config.callId) {
      throw new ValidationError('callId is required');
    }
    if (!config.voiceId) {
      throw new ValidationError('voiceId is required');
    }
    if (!config.systemPrompt) {
      throw new ValidationError('systemPrompt is required');
    }
    this.config = config;
    this.deps = deps;
  }

  public async start(): Promise<void> {
    if (this.ended) {
      throw new FactoryBaseError(
        ErrorCodes.TELEPHONY_SESSION_FAILED,
        'Cannot start a session that has already ended',
        409,
        false,
      );
    }
    this.started = true;
    this.dispatchEvent(new Event('start'));
    await Promise.resolve();
  }

  public async processAudio(audio: ArrayBuffer): Promise<void> {
    if (!this.started) {
      throw new FactoryBaseError(
        ErrorCodes.TELEPHONY_SESSION_FAILED,
        'Session has not been started',
        409,
        false,
      );
    }
    if (this.ended) {
      throw new FactoryBaseError(
        ErrorCodes.TELEPHONY_SESSION_FAILED,
        'Session has already ended',
        409,
        false,
      );
    }
    const now = this.deps.now ?? Date.now;
    const userText = await transcribe(
      audio,
      this.config.env.DEEPGRAM_API_KEY,
      { language: this.config.language ?? DEFAULT_LANGUAGE },
      this.deps,
    );
    if (userText.length === 0) {
      return;
    }
    const userTranscript: Transcript = {
      speaker: 'user',
      text: userText,
      ts: now(),
      duration: 0,
    };
    this.transcripts.push(userTranscript);
    this.history.push({ role: 'user', content: userText });
    this.dispatchEvent(new CustomEvent('transcript', { detail: userTranscript }));

    const llmEnv: LLMEnv = {
      AI_GATEWAY_BASE_URL: this.config.env.AI_GATEWAY_BASE_URL,
      ANTHROPIC_API_KEY: this.config.env.ANTHROPIC_API_KEY,
      GROQ_API_KEY: this.config.env.GROQ_API_KEY,
      VERTEX_ACCESS_TOKEN: this.config.env.VERTEX_ACCESS_TOKEN,
      VERTEX_PROJECT: this.config.env.VERTEX_PROJECT,
      VERTEX_LOCATION: this.config.env.VERTEX_LOCATION,
    };
    const llmResponse: FactoryResponse<{ content: string }> = await llmComplete(
      this.history,
      llmEnv,
      { system: this.config.systemPrompt },
      this.deps,
    );
    if (llmResponse.error || !llmResponse.data) {
      throw new InternalError(
        llmResponse.error?.message ?? 'LLM produced no response',
        { code: llmResponse.error?.code },
      );
    }
    const agentText = llmResponse.data.content;
    this.history.push({ role: 'assistant', content: agentText });
    const agentTranscript: Transcript = {
      speaker: 'agent',
      text: agentText,
      ts: now(),
      duration: 0,
    };
    this.transcripts.push(agentTranscript);
    this.dispatchEvent(new CustomEvent('transcript', { detail: agentTranscript }));

    const audioOut = await synthesize(
      agentText,
      this.config.voiceId,
      this.config.env.ELEVENLABS_API_KEY,
      {},
      this.deps,
    );
    this.dispatchEvent(new CustomEvent('audio', { detail: audioOut }));
  }

  public async end(): Promise<Transcript[]> {
    this.ended = true;
    this.started = false;
    this.dispatchEvent(new Event('end'));
    await Promise.resolve();
    return [...this.transcripts];
  }
}

// ---------------------------------------------------------------------------
// WB-3: Platform-safe helpers
// ---------------------------------------------------------------------------

/**
 * Identifies which telephony provider handled a call.
 * Add new providers here as the platform grows.
 */
export type CallProvider = 'telnyx' | 'twilio';

/**
 * Converts a base64 string to a Uint8Array using the platform-safe `atob` API.
 * Returns null if the input is not valid base64.
 *
 * @internal
 */
function base64ToUint8Array(b64: string): Uint8Array | null {
  try {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Returns true if the current local time in `ianaTimezone` falls within the
 * permitted calling window [08:00, 21:00] inclusive.
 *
 * Uses `Intl.DateTimeFormat` — fully platform-safe, no Node.js built-ins required.
 *
 * @param ianaTimezone - An IANA timezone identifier (e.g. `'America/New_York'`).
 * @param nowUtc - Optional override for "now" — defaults to `new Date()`.
 * @returns `true` if calling is permitted, `false` otherwise.
 */
export function isWithinCallingHours(ianaTimezone: string, nowUtc: Date = new Date()): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaTimezone,
    hour: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(nowUtc);
  const hourPart = parts.find((p) => p.type === 'hour');
  const hour = Number(hourPart?.value ?? '0');
  return hour >= 8 && hour <= 21;
}

/**
 * Verifies a Telnyx webhook signature using the Ed25519 algorithm via the Web Crypto API.
 * Returns `false` on any error and never throws — safe to call unconditionally.
 *
 * @param payload - The raw request body string.
 * @param signature - The base64-encoded Ed25519 signature from the `telnyx-signature-ed25519` header.
 * @param publicKey - The base64-encoded SPKI DER Ed25519 public key for your Telnyx account.
 * @returns `true` if the signature is valid, `false` otherwise.
 */
export async function verifyTelnyxWebhook(
  payload: string,
  signature: string,
  publicKey: string,
): Promise<boolean> {
  try {
    const signatureBytes = base64ToUint8Array(signature);
    if (!signatureBytes) return false;

    const publicKeyBytes = base64ToUint8Array(publicKey);
    if (!publicKeyBytes) return false;

    const key = await crypto.subtle.importKey(
      'spki',
      publicKeyBytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );

    const payloadBytes = new TextEncoder().encode(payload);

    return await crypto.subtle.verify('Ed25519', key, signatureBytes, payloadBytes);
  } catch {
    return false;
  }
}
