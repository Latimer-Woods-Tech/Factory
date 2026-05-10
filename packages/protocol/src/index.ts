/**
 * @latimer-woods-tech/protocol
 *
 * Canonical inter-agent / bot message schema for the Factory pipeline.
 *
 * SCOPE: Internal agent orchestration, CI/CD workflows, Worker-to-Worker calls.
 *
 * OUT OF SCOPE — NEVER import this package from:
 *   - Any UI package (design-system, ui, design-tokens, studio-core)
 *   - Any customer-facing Hono route handler
 *   - Any Human Design application logic
 *   - Any surface visible to end-users or customers
 *
 * Wire format: minified JSON. Field names are abbreviated to minimise token
 * cost when envelopes pass through LLM context windows.
 *
 * Decode always returns a fully-typed AgentEnvelope — no `any`, no casting.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Current wire-format schema version. Increment when breaking changes land. */
export const PROTOCOL_VERSION = 1;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Exhaustive set of operations agents may request or report.
 * Kept as a short string enum so LLMs read them cheaply.
 */
export type OpCode =
  | 'build'
  | 'build.done'
  | 'build.fail'
  | 'test'
  | 'test.done'
  | 'test.fail'
  | 'deploy'
  | 'deploy.done'
  | 'deploy.fail'
  | 'validate'
  | 'validate.done'
  | 'validate.fail'
  | 'job.start'
  | 'job.done'
  | 'job.fail'
  | 'job.skip'
  | 'health'
  | 'health.ok'
  | 'health.fail'
  | 'ticket.create'
  | 'ticket.update'
  | 'ticket.close'
  | 'pipeline.trigger'
  | 'pipeline.status'
  | 'agent.ready'
  | 'agent.busy'
  | 'agent.idle'
  | 'video.job.fetch'
  | 'video.job.fetch.done'
  | 'video.job.tick'
  | 'video.job.tick.done'
  | 'video.job.marking'
  | 'video.job.dispatch'
  | 'video.job.dispatch.done'
  | 'video.job.dispatch.fail';

/** Compact status codes. 'pend' = in-flight, 'skip' = intentionally skipped. */
export type Status = 'ok' | 'err' | 'pend' | 'skip';

/**
 * Structured error carried inside a failed envelope.
 * All values are strings to keep the wire format flat and cheap.
 */
export interface AgentError {
  /** Machine-readable code — use ErrorCodes from @latimer-woods-tech/errors when applicable. */
  code: string;
  /** Human-readable summary (English, for logs only). */
  msg: string;
  /** Optional flat key→value context. Values must be strings. */
  ctx?: Record<string, string>;
}

/**
 * The canonical inter-agent message envelope.
 *
 * Field abbreviations (wire → meaning):
 *   v   → schema version
 *   id  → correlation ID (8-char alphanumeric, unique per message)
 *   ts  → unix timestamp ms
 *   src → sender agent/service identifier
 *   dst → target agent/service identifier ('*' = broadcast)
 *   op  → operation code
 *   st  → status
 *   pay → operation-specific payload (typed per-op via AgentPayloadMap)
 *   err → error detail (only when st='err')
 *   meta → optional flat string metadata (trace IDs, env tags, etc.)
 */
export interface AgentEnvelope<P = unknown> {
  v: typeof PROTOCOL_VERSION;
  id: string;
  ts: number;
  src: string;
  dst: string;
  op: OpCode;
  st: Status;
  pay?: P;
  err?: AgentError;
  meta?: Record<string, string>;
}

// ============================================================================
// PAYLOAD TYPES
// ============================================================================

/** Payloads for build ops. */
export interface BuildPayload {
  pkg: string;
  ref?: string;
}

/** Payloads for deploy ops. */
export interface DeployPayload {
  pkg: string;
  env: 'staging' | 'production';
  url?: string;
}

/** Payloads for test ops. */
export interface TestPayload {
  pkg: string;
  coverage?: number;
  passed?: number;
  failed?: number;
}

/** Payloads for validate ops. */
export interface ValidatePayload {
  target: string;
  score?: number;
  issues?: string[];
}

/** Payloads for job ops. */
export interface JobPayload {
  jobId: string;
  kind: string;
  result?: string;
}

/** Payloads for ticket ops. */
export interface TicketPayload {
  ticketId: string;
  title: string;
  body?: string;
  status?: string;
}

/** Payloads for health ops. */
export interface HealthPayload {
  url: string;
  httpStatus?: number;
  latencyMs?: number;
}

/** Payloads for pipeline ops. */
export interface PipelinePayload {
  pipeline: string;
  run?: string;
  status?: string;
}

/** Payloads for video render job ops. */
export interface VideoJobPayload {
  jobId: string;
  appId: string;
  topic: string;
  type: 'marketing' | 'training' | 'walkthrough';
  /** Current lifecycle status of the job. */
  status: 'pending' | 'rendering' | 'uploading' | 'done' | 'failed';
  /** Optional failure reason (present when status='failed'). */
  reason?: string;
}

/** Payloads for GitHub Actions workflow dispatch ops. */
export interface VideoDispatchPayload {
  jobId: string;
  appId: string;
  repo: string;
  compositionId: string;
  topic: string;
}

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generates an 8-character collision-resistant correlation ID using the
 * Web Crypto API (available in both Cloudflare Workers and modern browsers).
 * Excludes visually ambiguous characters (0, O, 1, I, l).
 *
 * @returns An 8-character alphanumeric correlation ID.
 */
export function generateId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  // Reject samples >= max so byte % chars.length is uniformly distributed
  // (avoids modulo bias on cryptographically random bytes).
  const max = Math.floor(256 / chars.length) * chars.length;
  const result: string[] = [];
  while (result.length < 8) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    for (const b of bytes) {
      if (result.length >= 8) break;
      if (b < max) result.push(chars[b % chars.length] as string);
    }
  }
  return result.join('');
}

// ============================================================================
// ENCODE / DECODE
// ============================================================================

/**
 * Serialises an AgentEnvelope to a minified JSON string.
 * Undefined fields are omitted automatically by JSON.stringify.
 *
 * @param envelope - The envelope to serialise.
 * @returns A minified JSON string.
 */
export function encode<P>(envelope: AgentEnvelope<P>): string {
  return JSON.stringify(envelope);
}

/** Thrown when decode receives a structurally invalid envelope. */
export class ProtocolDecodeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ProtocolDecodeError';
  }
}

/**
 * Parses a JSON string and validates it as an AgentEnvelope.
 * Throws ProtocolDecodeError on any structural violation.
 * Never returns `any` — the payload is typed as `unknown` until the caller
 * narrows it via their op-specific payload type.
 *
 * @param raw - A JSON string to parse.
 * @returns A validated {@link AgentEnvelope} with an unknown payload.
 * @throws {@link ProtocolDecodeError} if the string is not a valid envelope.
 */
export function decode(raw: string): AgentEnvelope<unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ProtocolDecodeError(`Invalid JSON: ${raw.slice(0, 100)}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ProtocolDecodeError('Envelope must be a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj['v'] !== PROTOCOL_VERSION) {
    throw new ProtocolDecodeError(
      `Unsupported protocol version: ${String(obj['v'])} (expected ${PROTOCOL_VERSION})`,
    );
  }
  if (typeof obj['id'] !== 'string' || obj['id'].length === 0) {
    throw new ProtocolDecodeError('Missing or invalid field: id');
  }
  if (typeof obj['ts'] !== 'number') {
    throw new ProtocolDecodeError('Missing or invalid field: ts');
  }
  if (typeof obj['src'] !== 'string') {
    throw new ProtocolDecodeError('Missing or invalid field: src');
  }
  if (typeof obj['dst'] !== 'string') {
    throw new ProtocolDecodeError('Missing or invalid field: dst');
  }
  if (typeof obj['op'] !== 'string') {
    throw new ProtocolDecodeError('Missing or invalid field: op');
  }
  if (typeof obj['st'] !== 'string') {
    throw new ProtocolDecodeError('Missing or invalid field: st');
  }

  return obj as unknown as AgentEnvelope<unknown>;
}

// ============================================================================
// ENVELOPE FACTORY FUNCTIONS
// ============================================================================

/** Options for createEnvelope. */
export interface EnvelopeOptions<P> {
  src: string;
  dst: string;
  op: OpCode;
  st: Status;
  pay?: P;
  err?: AgentError;
  meta?: Record<string, string>;
}

/**
 * Creates a fully-populated AgentEnvelope with a generated ID and current
 * timestamp. Prefer this over constructing the object manually.
 *
 * @param opts - Options describing the envelope's routing and payload.
 * @returns A complete {@link AgentEnvelope}.
 */
export function createEnvelope<P>(opts: EnvelopeOptions<P>): AgentEnvelope<P> {
  return {
    v: PROTOCOL_VERSION,
    id: generateId(),
    ts: Date.now(),
    src: opts.src,
    dst: opts.dst,
    op: opts.op,
    st: opts.st,
    pay: opts.pay,
    err: opts.err,
    meta: opts.meta,
  };
}

/**
 * Shorthand: create an 'ok' envelope.
 *
 * @param src - Sender agent identifier.
 * @param dst - Destination agent identifier.
 * @param op - Operation code.
 * @param pay - Optional payload.
 * @param meta - Optional metadata.
 */
export function ok<P>(
  src: string,
  dst: string,
  op: OpCode,
  pay?: P,
  meta?: Record<string, string>,
): AgentEnvelope<P> {
  return createEnvelope({ src, dst, op, st: 'ok', pay, meta });
}

/**
 * Shorthand: create an 'err' envelope.
 *
 * @param src - Sender agent identifier.
 * @param dst - Destination agent identifier.
 * @param op - Operation code.
 * @param error - Structured error detail.
 * @param meta - Optional metadata.
 */
export function err(
  src: string,
  dst: string,
  op: OpCode,
  error: AgentError,
  meta?: Record<string, string>,
): AgentEnvelope<never> {
  return createEnvelope({ src, dst, op, st: 'err', err: error, meta });
}

/**
 * Shorthand: create a 'pend' (in-flight) envelope.
 *
 * @param src - Sender agent identifier.
 * @param dst - Destination agent identifier.
 * @param op - Operation code.
 * @param pay - Optional payload.
 * @param meta - Optional metadata.
 */
export function pend<P>(
  src: string,
  dst: string,
  op: OpCode,
  pay?: P,
  meta?: Record<string, string>,
): AgentEnvelope<P> {
  return createEnvelope({ src, dst, op, st: 'pend', pay, meta });
}
