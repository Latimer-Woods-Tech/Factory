import { describe, it, expect } from 'vitest';
import { createEnvelope, parseEnvelope } from './index.js';

describe('createEnvelope', () => {
  it('creates an event envelope with correct fields', () => {
    const env = createEnvelope({ type: 'event', action: 'user.created', payload: { id: '1' } });
    expect(env.type).toBe('event');
    expect(env.action).toBe('user.created');
    expect(env.payload).toEqual({ id: '1' });
    expect(env.correlationId).toBeNull();
    expect(env.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes correlationId when provided', () => {
    const env = createEnvelope({
      type: 'request',
      action: 'video.encode',
      payload: { videoId: 'v1' },
      correlationId: 'trace-abc',
    });
    expect(env.correlationId).toBe('trace-abc');
  });

  it('sets correlationId to null when omitted', () => {
    const env = createEnvelope({ type: 'response', action: 'auth.check', payload: { ok: true } });
    expect(env.correlationId).toBeNull();
  });

  it('preserves typed payload', () => {
    const payload = { count: 42, tags: ['a', 'b'] };
    const env = createEnvelope({ type: 'event', action: 'stats.updated', payload });
    expect(env.payload.count).toBe(42);
    expect(env.payload.tags).toEqual(['a', 'b']);
  });
});

describe('parseEnvelope', () => {
  it('parses a valid envelope JSON string', () => {
    const original = createEnvelope({
      type: 'response',
      action: 'auth.check',
      payload: { ok: true },
    });
    const parsed = parseEnvelope<{ ok: boolean }>(JSON.stringify(original));
    expect(parsed).not.toBeNull();
    expect(parsed?.action).toBe('auth.check');
    expect(parsed?.payload.ok).toBe(true);
  });

  it('returns null for invalid JSON', () => {
    expect(parseEnvelope('not-json')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(parseEnvelope(JSON.stringify({ type: 'event' }))).toBeNull();
  });

  it('returns null for an unknown type value', () => {
    const bad = JSON.stringify({
      type: 'unknown',
      action: 'x',
      payload: {},
      timestamp: '2026-01-01T00:00:00Z',
      correlationId: null,
    });
    expect(parseEnvelope(bad)).toBeNull();
  });

  it('returns null for a non-object input', () => {
    expect(parseEnvelope('"a string"')).toBeNull();
    expect(parseEnvelope('42')).toBeNull();
    expect(parseEnvelope('null')).toBeNull();
  });
});
