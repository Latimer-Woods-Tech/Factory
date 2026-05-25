import { Hono } from 'hono';
import { complete } from '@latimer-woods-tech/llm';
import type { LLMEnv } from '@latimer-woods-tech/llm';
import { createLogger, generateRequestId } from '@latimer-woods-tech/logger';

// ── Environment bindings ──────────────────────────────────────────────────────

/**
 * Cloudflare Worker bindings for inbound-oracle.
 * Extends LLMEnv so complete() can be called with env directly.
 */
export interface Env extends LLMEnv {
  // R2 bucket for TTS audio storage
  AUDIO_BUCKET: R2Bucket;

  // Non-secret vars
  ENVIRONMENT: string;
  /** Telnyx E.164 number to send MMS from. */
  TELNYX_FROM_NUMBER: string;
  /** ElevenLabs voice ID used for TTS synthesis. */
  ELEVENLABS_VOICE_ID: string;
  /** Base URL where audio files are served (this worker's custom domain). */
  AUDIO_PUBLIC_BASE_URL: string;

  // Secrets injected by Cloudflare at runtime
  TELNYX_API_KEY: string;
  ELEVENLABS_API_KEY: string;
}

// ── Telnyx webhook types ──────────────────────────────────────────────────────

interface TelnyxEndpoint {
  phone_number?: string;
}

interface TelnyxInboundPayload {
  id?: string;
  direction?: string;
  from?: TelnyxEndpoint;
  to?: TelnyxEndpoint[];
  text?: string;
}

interface TelnyxWebhookBody {
  data?: {
    event_type?: string;
    payload?: TelnyxInboundPayload;
  };
}

// ── Birth-detail extraction ───────────────────────────────────────────────────

interface BirthDetails {
  date: string | null;
  time: string | null;
  city: string | null;
}

/**
 * Best-effort extraction of birth date, time, and city from raw SMS text.
 * Handles labelled ("Date: June 5 1985") and natural language forms.
 */
function parseBirthDetails(text: string): BirthDetails {
  const s = text.replace(/\n/g, ' ');

  const dateMatch =
    s.match(/\bdate[:\s]+([A-Za-z0-9,\/\s\-]+?)(?=\s*(?:time|city|location|,|;|$))/i) ??
    s.match(
      /\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})/i,
    ) ??
    s.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);

  const timeMatch =
    s.match(/\btime[:\s]+([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM|am|pm)?)/i) ??
    s.match(/\b([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM|am|pm))/i);

  const cityMatch =
    s.match(/\b(?:city|location|place)[:\s]+([A-Za-z\s,]+?)(?=\s*(?:\.|,|;|$))/i) ??
    s.match(/\bin\s+([A-Z][a-zA-Z\s]{2,25})(?=\s*(?:\.|,|;|$))/);

  return {
    date: dateMatch?.[1]?.trim() ?? null,
    time: timeMatch?.[1]?.trim() ?? null,
    city: cityMatch?.[1]?.trim() ?? null,
  };
}

// ── LLM: Human Design reading ─────────────────────────────────────────────────

/**
 * Generates a 3-sentence Human Design reading via Anthropic Haiku (fast tier)
 * using @latimer-woods-tech/llm routed through Cloudflare AI Gateway.
 */
async function generateReading(
  details: BirthDetails,
  env: Env,
  requestId: string,
): Promise<string> {
  const parts = [
    details.date ? `birth date ${details.date}` : null,
    details.time ? `birth time ${details.time}` : null,
    details.city ? `birth city ${details.city}` : null,
  ].filter(Boolean);

  const birthInfo =
    parts.length > 0 ? parts.join(', ') : 'an unspecified birth date and time';

  const result = await complete(
    [
      {
        role: 'user',
        content:
          `You are Forge, the Human Design reading voice for selfprime.net. ` +
          `Write exactly 1 short sentence identifying their likely Human Design energy type and one key life theme based on their birth info. Then, write 2 sentences of heavy, persuasive marketing copy telling them that their full chart holds the exact mechanics to stop their burnout, bypass resistance, and unlock their operational leverage. Tone: direct, sharp, highly persuasive. No disclaimers. Respond with only the 3 sentences.`,
      },
    ],
    env,
    {
      tier: 'balanced',
      maxTokens: 300,
      temperature: 0.8,
      runId: requestId,
      project: 'inbound-oracle',
      actor: 'worker',
    },
  );

  if (result.error || !result.data) {
    throw new Error(`LLM completion failed: ${result.error.message}`);
  }

  return result.data!.content.trim();
}

// ── ElevenLabs: TTS synthesis ─────────────────────────────────────────────────

const ELEVENLABS_TTS_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';

/**
 * Calls ElevenLabs TTS and returns raw MP3 bytes.
 */
async function synthesizeAudio(
  text: string,
  voiceId: string,
  apiKey: string,
): Promise<ArrayBuffer> {
  const url = `${ELEVENLABS_TTS_BASE}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => String(res.status));
    throw new Error(`ElevenLabs TTS error (${res.status}): ${msg}`);
  }

  return res.arrayBuffer();
}

// ── R2: audio storage ─────────────────────────────────────────────────────────

/**
 * Stores MP3 bytes in R2 and returns the public URL served by this worker's
 * GET /audio/* route.
 */
async function storeAudio(
  audioBuffer: ArrayBuffer,
  bucket: R2Bucket,
  baseUrl: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const key = `readings/${id}.mp3`;

  await bucket.put(key, audioBuffer, {
    httpMetadata: { contentType: 'audio/mpeg' },
    customMetadata: { createdAt: new Date().toISOString() },
  });

  return `${baseUrl.replace(/\/$/,'')}/audio/readings/${id}.mp3`;
}

// ── Telnyx: send MMS reply ────────────────────────────────────────────────────

const TELNYX_MESSAGES_URL = 'https://api.telnyx.com/v2/messages';
const CHECKOUT_URL = 'https://selfprime.net/checkout';

/**
 * Sends an MMS reply via the Telnyx v2 Messages API.
 * The message includes the 3-sentence reading, a link to the audio, and
 * the Stripe checkout link.
 */
async function sendMmsReply(
  to: string,
  from: string,
  readingText: string,
  audioUrl: string,
  apiKey: string,
): Promise<void> {
  const res = await fetch(TELNYX_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to,
      text: [
        readingText,
        '',
        `🎧 Listen to your reading: ${audioUrl}`,
        '',
        `✨ Unlock your full Human Design chart: ${CHECKOUT_URL}`,
      ].join('\n'),
      media_urls: [audioUrl],
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => String(res.status));
    throw new Error(`Telnyx MMS error (${res.status}): ${msg}`);
  }
}

// ── Hono app ──────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

/** Liveness probe */
app.get('/health', (c) =>
  c.json({ ok: true, service: 'inbound-oracle', env: c.env.ENVIRONMENT }),
);

/**
 * Serve TTS audio objects stored in R2.
 * Route: GET /audio/readings/:uuid.mp3
 */
app.get('/audio/*', async (c) => {
  const key = c.req.path.replace(/^\/audio\//, '');
  const object = await c.env.AUDIO_BUCKET.get(key);
  if (!object) return c.notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=86400');
  return new Response(object.body, { headers });
});

/**
 * POST /webhook/telnyx
 *
 * Handles Telnyx inbound SMS webhooks.
 * Pipeline: parse birth details → LLM reading → ElevenLabs TTS → R2 upload → Telnyx MMS reply.
 */
app.post('/webhook/telnyx', async (c) => {
  const requestId = generateRequestId();
  const logger = createLogger({
    service: 'inbound-oracle',
    requestId,
    environment: c.env.ENVIRONMENT,
  });

  let body: TelnyxWebhookBody;
  try {
    body = await c.req.json<TelnyxWebhookBody>();
  } catch {
    logger.warn('Failed to parse Telnyx webhook body as JSON');
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }

  const eventType = body.data?.event_type;
  
  // --- Voice Intercept Logic ---
  if (eventType === 'call.initiated') {
    const callControlId = body.data?.payload?.call_control_id;
    if (!callControlId) return c.json({ ok: false, error: 'missing_call_control_id' }, 400);
    
    logger.info({ callControlId }, 'Answering incoming call');
    
    // Answer the call
    await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${c.env.TELNYX_API_KEY}`
      },
      body: JSON.stringify({
        client_state: 'answered_by_oracle'
      })
    });
    
    return c.json({ ok: true });
  }

  if (eventType === 'call.answered') {
    const callControlId = body.data?.payload?.call_control_id;
    if (!callControlId) return c.json({ ok: false, error: 'missing_call_control_id' }, 400);
    
    logger.info({ callControlId }, 'Speaking welcome message');
    
    // Speak the message
    await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${c.env.TELNYX_API_KEY}`
      },
      body: JSON.stringify({
        payload: 'Welcome to Selfprime. Your energetic blueprint holds the exact mechanics to stop your burnout and unlock your leverage. To get your personalized Human Design reading, hang up and text your birth date, time, and city to this number. I will text you back a free audio reading and a private link to your full chart.',
        voice: 'female',
        language: 'en-US',
        client_state: 'spoken_welcome'
      })
    });
    
    return c.json({ ok: true });
  }

  if (eventType === 'call.speak.ended') {
    const callControlId = body.data?.payload?.call_control_id;
    if (!callControlId) return c.json({ ok: false, error: 'missing_call_control_id' }, 400);
    
    logger.info({ callControlId }, 'Hanging up call');
    
    // Hang up
    await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${c.env.TELNYX_API_KEY}`
      },
      body: JSON.stringify({
        client_state: 'hung_up'
      })
    });
    
    return c.json({ ok: true });
  }

  if (eventType !== 'message.received') {
    logger.info({ eventType }, 'Skipping non-message event');
    return c.json({ ok: true, ignored: true, eventType });
  }

  const payload = body.data?.payload;
  const fromNumber = payload?.from?.phone_number;
  const toNumber = payload?.to?.[0]?.phone_number ?? c.env.TELNYX_FROM_NUMBER;
  const smsText = payload?.text ?? '';

  if (!fromNumber) {
    logger.warn({ payload }, 'Telnyx webhook missing sender phone number');
    return c.json({ ok: false, error: 'missing_from_number' }, 400);
  }

  logger.info({ fromNumber, smsTextLength: smsText.length }, 'Processing inbound SMS');

  try {
    // 1. Parse birth details from SMS text
    const details = parseBirthDetails(smsText);
    logger.info({ details }, 'Birth details parsed');

    // 2. Generate 3-sentence Human Design reading via @latimer-woods-tech/llm (Anthropic Haiku)
    const reading = await generateReading(details, c.env, requestId);
    logger.info({ readingLength: reading.length }, 'Human Design reading generated');

    // 3. Synthesize TTS audio via ElevenLabs
    const audioBuffer = await synthesizeAudio(
      reading,
      c.env.ELEVENLABS_VOICE_ID,
      c.env.ELEVENLABS_API_KEY,
    );
    logger.info({ audioBytes: audioBuffer.byteLength }, 'TTS audio synthesized');

    // 4. Store audio in R2 and get public URL
    const audioUrl = await storeAudio(
      audioBuffer,
      c.env.AUDIO_BUCKET,
      c.env.AUDIO_PUBLIC_BASE_URL,
    );
    logger.info({ audioUrl }, 'Audio stored in R2');

    // 5. Send MMS reply with audio link + Stripe checkout
    await sendMmsReply(fromNumber, toNumber, reading, audioUrl, c.env.TELNYX_API_KEY);
    logger.info({ to: fromNumber }, 'MMS reply dispatched');

    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message, fromNumber }, 'Failed to process inbound SMS');
    return c.json({ ok: false, error: message }, 500);
  }
});

export default app;
