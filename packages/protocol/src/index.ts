/**
 * @latimer-woods-tech/protocol
 * Shared protocol types and message envelope schemas for cross-worker communication.
 */

/** Allowed top-level message categories in the protocol. */
export type ProtocolMessageType = 'request' | 'response' | 'event' | 'error';

/** Generic typed message envelope for cross-worker messages. */
export interface ProtocolEnvelope<T> {
  /** Message type category. */
  type: ProtocolMessageType;
  /** Action or event name, e.g. "user.created" or "video.encode.complete". */
  action: string;
  /** Typed message payload. */
  payload: T;
  /** ISO-8601 timestamp when the envelope was created. */
  timestamp: string;
  /** Optional correlation ID for request/response tracing. Null when not set. */
  correlationId: string | null;
}

/** Input for createEnvelope — correlationId is optional. */
export interface CreateEnvelopeInput<T> {
  /** Message type category. */
  type: ProtocolMessageType;
  /** Action or event name. */
  action: string;
  /** Typed message payload. */
  payload: T;
  /** Optional correlation ID for tracing. */
  correlationId?: string;
}

/**
 * Creates a protocol envelope with the current timestamp.
 * CorrelationId defaults to null when not provided.
 */
export function createEnvelope<T>(input: CreateEnvelopeInput<T>): ProtocolEnvelope<T> {
  return {
    type: input.type,
    action: input.action,
    payload: input.payload,
    timestamp: new Date().toISOString(),
    correlationId: input.correlationId ?? null,
  };
}

/**
 * Parses a raw JSON string as a typed protocol envelope.
 * Returns null if the string is not valid JSON or is missing required fields.
 */
export function parseEnvelope<T>(raw: string): ProtocolEnvelope<T> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('type' in parsed) ||
    !('action' in parsed) ||
    !('payload' in parsed) ||
    !('timestamp' in parsed)
  ) {
    return null;
  }

  const envelope = parsed as ProtocolEnvelope<T>;
  const validTypes: ProtocolMessageType[] = ['request', 'response', 'event', 'error'];
  if (!validTypes.includes(envelope.type)) return null;

  return envelope;
}
