import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PROTOCOL_VERSION,
  generateId,
  encode,
  decode,
  createEnvelope,
  ok,
  err,
  pend,
  ProtocolDecodeError,
  type AgentEnvelope,
  type AgentError,
  type BuildPayload,
} from './index.js';

// ---------------------------------------------------------------------------
// generateId
// ---------------------------------------------------------------------------

describe('generateId', () => {
  it('returns an 8-character string', () => {
    expect(generateId()).toHaveLength(8);
  });

  it('contains only safe alphanumeric characters', () => {
    const id = generateId();
    expect(id).toMatch(/^[A-HJ-NP-Za-hj-np-z2-9]{8}$/);
  });

  it('produces unique IDs across successive calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// encode / decode round-trip
// ---------------------------------------------------------------------------

describe('encode / decode', () => {
  it('round-trips an envelope through JSON without loss', () => {
    const envelope: AgentEnvelope<BuildPayload> = {
      v: PROTOCOL_VERSION,
      id: 'abc12345',
      ts: 1000000,
      src: 'ci-agent',
      dst: 'deploy-agent',
      op: 'build',
      st: 'ok',
      pay: { pkg: '@latimer-woods-tech/errors', ref: 'main' },
    };
    const raw = encode(envelope);
    const decoded = decode(raw);
    expect(decoded.v).toBe(PROTOCOL_VERSION);
    expect(decoded.id).toBe('abc12345');
    expect(decoded.src).toBe('ci-agent');
    expect(decoded.op).toBe('build');
    expect(decoded.st).toBe('ok');
  });

  it('produces minified JSON (no newlines)', () => {
    const envelope = ok('a', 'b', 'health');
    const raw = encode(envelope);
    expect(raw).not.toContain('\n');
  });
});

// ---------------------------------------------------------------------------
// decode — error cases
// ---------------------------------------------------------------------------

describe('decode — error cases', () => {
  it('throws ProtocolDecodeError on non-JSON input', () => {
    expect(() => decode('not json')).toThrow(ProtocolDecodeError);
  });

  it('throws on missing id field', () => {
    const broken = JSON.stringify({ v: 1, ts: 1, src: 'x', dst: 'y', op: 'health', st: 'ok' });
    expect(() => decode(broken)).toThrow(ProtocolDecodeError);
  });

  it('throws on wrong protocol version', () => {
    const broken = JSON.stringify({ v: 99, id: 'x', ts: 1, src: 'x', dst: 'y', op: 'health', st: 'ok' });
    expect(() => decode(broken)).toThrow(ProtocolDecodeError);
  });

  it('throws on array input', () => {
    expect(() => decode('[]')).toThrow(ProtocolDecodeError);
  });

  it('throws on null input', () => {
    expect(() => decode('null')).toThrow(ProtocolDecodeError);
  });

  it('throws on missing ts field', () => {
    const broken = JSON.stringify({ v: 1, id: 'abc12345', src: 'x', dst: 'y', op: 'build', st: 'ok' });
    expect(() => decode(broken)).toThrow(ProtocolDecodeError);
  });

  it('ProtocolDecodeError instances are instanceof Error', () => {
    try {
      decode('bad');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(ProtocolDecodeError);
    }
  });
});

// ---------------------------------------------------------------------------
// createEnvelope
// ---------------------------------------------------------------------------

describe('createEnvelope', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets protocol version to PROTOCOL_VERSION', () => {
    const e = createEnvelope({ src: 'a', dst: 'b', op: 'build', st: 'ok' });
    expect(e.v).toBe(PROTOCOL_VERSION);
  });

  it('sets ts to current Date.now()', () => {
    const e = createEnvelope({ src: 'a', dst: 'b', op: 'build', st: 'ok' });
    expect(e.ts).toBe(new Date('2026-05-07T12:00:00.000Z').getTime());
  });

  it('generates a non-empty id', () => {
    const e = createEnvelope({ src: 'a', dst: 'b', op: 'build', st: 'ok' });
    expect(e.id).toHaveLength(8);
  });

  it('propagates src, dst, op, st from options', () => {
    const e = createEnvelope({ src: 'ci', dst: 'scheduler', op: 'deploy', st: 'pend' });
    expect(e.src).toBe('ci');
    expect(e.dst).toBe('scheduler');
    expect(e.op).toBe('deploy');
    expect(e.st).toBe('pend');
  });

  it('attaches payload when provided', () => {
    const pay: BuildPayload = { pkg: 'my-pkg' };
    const e = createEnvelope({ src: 'a', dst: 'b', op: 'build', st: 'ok', pay });
    expect((e.pay as BuildPayload).pkg).toBe('my-pkg');
  });

  it('attaches err when provided', () => {
    const agentErr: AgentError = { code: 'BUILD_FAIL', msg: 'tsc error' };
    const e = createEnvelope({ src: 'a', dst: 'b', op: 'build.fail', st: 'err', err: agentErr });
    expect(e.err?.code).toBe('BUILD_FAIL');
  });
});

// ---------------------------------------------------------------------------
// ok / err / pend shorthands
// ---------------------------------------------------------------------------

describe('ok', () => {
  it('creates an envelope with st="ok"', () => {
    const e = ok('agent-a', 'agent-b', 'health');
    expect(e.st).toBe('ok');
    expect(e.src).toBe('agent-a');
    expect(e.dst).toBe('agent-b');
    expect(e.op).toBe('health');
  });

  it('attaches payload and meta when provided', () => {
    const e = ok('a', 'b', 'build', { pkg: 'foo' } as BuildPayload, { env: 'staging' });
    expect((e.pay as BuildPayload).pkg).toBe('foo');
    expect(e.meta?.['env']).toBe('staging');
  });
});

describe('err', () => {
  it('creates an envelope with st="err"', () => {
    const agentErr: AgentError = { code: 'FAIL', msg: 'something broke' };
    const e = err('agent-a', 'agent-b', 'build.fail', agentErr);
    expect(e.st).toBe('err');
    expect(e.err?.code).toBe('FAIL');
    expect(e.err?.msg).toBe('something broke');
  });
});

describe('pend', () => {
  it('creates an envelope with st="pend"', () => {
    const e = pend('agent-a', 'agent-b', 'deploy');
    expect(e.st).toBe('pend');
  });
});

// ---------------------------------------------------------------------------
// AgentEnvelope generic type (compile-time check via usage)
// ---------------------------------------------------------------------------

describe('AgentEnvelope generic typing', () => {
  it('carries typed payload through encode/decode flow', () => {
    const typed: AgentEnvelope<BuildPayload> = ok('x', 'y', 'build', { pkg: 'test-pkg' });
    const raw = encode(typed);
    const decoded = decode(raw);
    // Cast back to typed after decode (caller responsibility)
    const payload = decoded.pay as BuildPayload;
    expect(payload.pkg).toBe('test-pkg');
  });
});
