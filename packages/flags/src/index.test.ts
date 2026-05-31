import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFlagClient, evaluate } from './index.js';
import { createMockFlagClient, createMockFlagsEnv } from './mock.js';
import type { FlagsEnv, FlagContext } from './types.js';

const CTX: FlagContext = { app: 'myapp', env: 'staging' };

function makeFlags(overrides: Record<string, unknown> = {}): FlagsEnv['FLAGS'] {
  const get = (key: string, def: unknown) =>
    Promise.resolve(key in overrides ? overrides[key] : def);
  return {
    getBooleanValue: (k, d) => get(k, d) as Promise<boolean>,
    getStringValue: (k, d) => get(k, d) as Promise<string>,
    getNumberValue: (k, d) => get(k, d) as Promise<number>,
    getJSONValue: <T>(k: string, d: T) => get(k, d) as Promise<T>,
  };
}

function makeEnv(overrides: Record<string, unknown> = {}, db?: D1Database): FlagsEnv {
  return { ENVIRONMENT: 'staging', FLAGS: makeFlags(overrides), FLAG_TELEMETRY: db };
}

function makeD1(run: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ success: true })): D1Database {
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { prepare } as unknown as D1Database;
}

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// createFlagClient — evaluation
// ---------------------------------------------------------------------------

describe('createFlagClient', () => {
  it('returns the flag value for boolean', async () => {
    const client = createFlagClient(makeEnv({ 'myapp:ro:feat': true }), CTX);
    expect(await client.boolean('myapp:ro:feat', false)).toBe(true);
  });

  it('returns fallback for boolean when key absent', async () => {
    const client = createFlagClient(makeEnv(), CTX);
    expect(await client.boolean('myapp:ro:feat', false)).toBe(false);
  });

  it('evaluates killSwitch returning true (operational)', async () => {
    const client = createFlagClient(makeEnv({ 'myapp:ks:svc': true }), CTX);
    expect(await client.killSwitch('myapp:ks:svc')).toBe(true);
  });

  it('evaluates killSwitch returning false (disabled)', async () => {
    const client = createFlagClient(makeEnv({ 'myapp:ks:svc': false }), CTX);
    expect(await client.killSwitch('myapp:ks:svc')).toBe(false);
  });

  it('evaluates string flag', async () => {
    const client = createFlagClient(makeEnv({ 'myapp:cfg:theme': 'dark' }), CTX);
    expect(await client.string('myapp:cfg:theme', 'light')).toBe('dark');
  });

  it('returns string fallback for absent key', async () => {
    const client = createFlagClient(makeEnv(), CTX);
    expect(await client.string('myapp:cfg:theme', 'light')).toBe('light');
  });

  it('evaluates number flag', async () => {
    const client = createFlagClient(makeEnv({ 'myapp:cfg:limit': 50 }), CTX);
    expect(await client.number('myapp:cfg:limit', 10)).toBe(50);
  });

  it('returns number fallback for absent key', async () => {
    const client = createFlagClient(makeEnv(), CTX);
    expect(await client.number('myapp:cfg:limit', 10)).toBe(10);
  });

  it('evaluates json flag', async () => {
    const val = { warn: 80, error: 95 };
    const client = createFlagClient(makeEnv({ 'myapp:cfg:thr': val }), CTX);
    expect(await client.json('myapp:cfg:thr', { warn: 0, error: 0 })).toEqual(val);
  });

  it('returns json fallback for absent key', async () => {
    const client = createFlagClient(makeEnv(), CTX);
    expect(await client.json('myapp:cfg:thr', { warn: 70 })).toEqual({ warn: 70 });
  });

  it('json: fallback hit == true when value equals fallback', async () => {
    const fb = { x: 1 };
    const client = createFlagClient(makeEnv({ 'myapp:cfg:obj': { x: 1 } }), CTX);
    const result = await client.json('myapp:cfg:obj', fb);
    expect(result).toEqual(fb);
  });

  it('passes full context to FLAGS binding', async () => {
    const getBooleanValue = vi.fn().mockResolvedValue(true);
    const env: FlagsEnv = {
      ENVIRONMENT: 'staging',
      FLAGS: {
        getBooleanValue,
        getStringValue: (_, d) => Promise.resolve(d),
        getNumberValue: (_, d) => Promise.resolve(d),
        getJSONValue: <T>(_: string, d: T) => Promise.resolve(d),
      },
    };
    const ctx: FlagContext = { app: 'myapp', env: 'staging', userId: 'u_1', plan: 'agency', attributes: { region: 'us' } };
    const client = createFlagClient(env, ctx);
    await client.boolean('myapp:ro:feat', false);
    expect(getBooleanValue).toHaveBeenCalledWith('myapp:ro:feat', false, expect.objectContaining({
      app: 'myapp', userId: 'u_1', plan: 'agency', region: 'us',
    }));
  });

  it('uses ENVIRONMENT binding over context.env when available', async () => {
    const env = { ...makeEnv(), ENVIRONMENT: 'production' };
    const client = createFlagClient(env, CTX);
    // invalid key in production → warns, not throws
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(client.boolean('bad_key', false)).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid key'));
  });
});

// ---------------------------------------------------------------------------
// createFlagClient — guard / key validation
// ---------------------------------------------------------------------------

describe('guard', () => {
  it('throws for invalid key in non-production', async () => {
    const client = createFlagClient(makeEnv(), CTX);
    await expect(client.boolean('bad_key', false)).rejects.toThrow(/Invalid key/);
  });

  it('warns but returns fallback for invalid key in production', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env: FlagsEnv = { ...makeEnv(), ENVIRONMENT: 'production' };
    const client = createFlagClient(env, CTX);
    expect(await client.boolean('bad_key', true)).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid key'));
  });

  it('accepts valid global-scoped key', async () => {
    const client = createFlagClient(makeEnv(), CTX);
    await expect(client.boolean('global:ks:supervisor_automerge', false)).resolves.toBe(false);
  });

  it('accepts valid app-scoped key with ops type', async () => {
    const client = createFlagClient(makeEnv(), CTX);
    await expect(client.string('myapp:ops:rollout_pct', '0')).resolves.toBe('0');
  });
});

// ---------------------------------------------------------------------------
// createFlagClient — fallback on error / timeout
// ---------------------------------------------------------------------------

describe('fallback on error', () => {
  it('falls back for boolean when FLAGS binding throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env: FlagsEnv = {
      ENVIRONMENT: 'staging',
      FLAGS: {
        getBooleanValue: () => Promise.reject(new Error('binding down')),
        getStringValue: (_, d) => Promise.resolve(d),
        getNumberValue: (_, d) => Promise.resolve(d),
        getJSONValue: <T>(_: string, d: T) => Promise.resolve(d),
      },
    };
    expect(await createFlagClient(env, CTX).boolean('myapp:ro:feat', true)).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[flags] boolean(myapp:ro:feat)'),
      'binding down',
    );
  });

  it('falls back for killSwitch when binding throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env: FlagsEnv = {
      ENVIRONMENT: 'staging',
      FLAGS: {
        getBooleanValue: () => Promise.reject(new Error('ks error')),
        getStringValue: (_, d) => Promise.resolve(d),
        getNumberValue: (_, d) => Promise.resolve(d),
        getJSONValue: <T>(_: string, d: T) => Promise.resolve(d),
      },
    };
    expect(await createFlagClient(env, CTX).killSwitch('myapp:ks:svc')).toBe(true);
  });

  it('falls back for string when binding throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env: FlagsEnv = {
      ENVIRONMENT: 'staging',
      FLAGS: {
        getBooleanValue: (_, d) => Promise.resolve(d),
        getStringValue: () => Promise.reject(new Error('err')),
        getNumberValue: (_, d) => Promise.resolve(d),
        getJSONValue: <T>(_: string, d: T) => Promise.resolve(d),
      },
    };
    expect(await createFlagClient(env, CTX).string('myapp:cfg:t', 'x')).toBe('x');
  });

  it('falls back for number when binding throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env: FlagsEnv = {
      ENVIRONMENT: 'staging',
      FLAGS: {
        getBooleanValue: (_, d) => Promise.resolve(d),
        getStringValue: (_, d) => Promise.resolve(d),
        getNumberValue: () => Promise.reject(new Error('err')),
        getJSONValue: <T>(_: string, d: T) => Promise.resolve(d),
      },
    };
    expect(await createFlagClient(env, CTX).number('myapp:cfg:n', 5)).toBe(5);
  });

  it('falls back for json when binding throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env: FlagsEnv = {
      ENVIRONMENT: 'staging',
      FLAGS: {
        getBooleanValue: (_, d) => Promise.resolve(d),
        getStringValue: (_, d) => Promise.resolve(d),
        getNumberValue: (_, d) => Promise.resolve(d),
        getJSONValue: () => Promise.reject(new Error('err')),
      },
    };
    const fb = { z: 9 };
    expect(await createFlagClient(env, CTX).json('myapp:cfg:obj', fb)).toEqual(fb);
  });

  it('falls back for boolean when binding throws non-Error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env: FlagsEnv = {
      ENVIRONMENT: 'staging',
      FLAGS: {
        getBooleanValue: () => Promise.reject('string error'),
        getStringValue: (_, d) => Promise.resolve(d),
        getNumberValue: (_, d) => Promise.resolve(d),
        getJSONValue: <T>(_: string, d: T) => Promise.resolve(d),
      },
    };
    expect(await createFlagClient(env, CTX).boolean('myapp:ro:feat', false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createFlagClient — telemetry
// ---------------------------------------------------------------------------

describe('telemetry', () => {
  it('writes to D1 when FLAG_TELEMETRY is set', async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const db = makeD1(run);
    const env = makeEnv({ 'myapp:ro:feat': true }, db);
    await createFlagClient(env, CTX).boolean('myapp:ro:feat', false);
    expect(run).toHaveBeenCalled();
  });

  it('uses waitUntil when executionCtx is provided', async () => {
    const waitUntil = vi.fn();
    const db = makeD1();
    const env = makeEnv({}, db);
    await createFlagClient(env, CTX, { waitUntil }).boolean('myapp:ro:feat', false);
    expect(waitUntil).toHaveBeenCalled();
  });

  it('does not crash when D1 write fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const run = vi.fn().mockRejectedValue(new Error('D1 down'));
    const db = makeD1(run);
    const env = makeEnv({}, db);
    await expect(createFlagClient(env, CTX).boolean('myapp:ro:feat', false)).resolves.toBe(false);
  });

  it('skips telemetry when FLAG_TELEMETRY is absent', async () => {
    const env = makeEnv();
    // Should not throw even with no D1
    await expect(createFlagClient(env, CTX).boolean('myapp:ro:feat', false)).resolves.toBe(false);
  });

  it('includes userId and plan when present in context', async () => {
    const run = vi.fn().mockResolvedValue({ success: true });
    const bind = vi.fn().mockReturnValue({ run });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;
    const ctx: FlagContext = { app: 'myapp', env: 'staging', userId: 'u_42', plan: 'practitioner' };
    const env = makeEnv({}, db);
    await createFlagClient(env, ctx).boolean('myapp:ro:feat', false);
    // bind is called with positional args; userId = arg index 2
    const bindArgs = bind.mock.calls[0] as unknown[];
    expect(bindArgs).toContain('u_42');
    expect(bindArgs).toContain('practitioner');
  });
});

// ---------------------------------------------------------------------------
// evaluate shorthand
// ---------------------------------------------------------------------------

describe('evaluate', () => {
  it('evaluates a boolean flag via the shorthand', async () => {
    const env = makeEnv({ 'myapp:ro:feat': true });
    expect(await evaluate(env, 'myapp:ro:feat', false, CTX)).toBe(true);
  });

  it('returns fallback via shorthand when flag absent', async () => {
    const env = makeEnv();
    expect(await evaluate(env, 'myapp:ro:feat', true, CTX)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createMockFlagClient
// ---------------------------------------------------------------------------

describe('createMockFlagClient', () => {
  it('returns override for boolean', async () => {
    const client = createMockFlagClient({ 'myapp:ro:x': true });
    expect(await client.boolean('myapp:ro:x', false)).toBe(true);
  });

  it('returns fallback for absent boolean key', async () => {
    expect(await createMockFlagClient().boolean('myapp:ro:x', false)).toBe(false);
  });

  it('killSwitch returns override', async () => {
    expect(await createMockFlagClient({ 'myapp:ks:svc': false }).killSwitch('myapp:ks:svc')).toBe(false);
  });

  it('killSwitch defaults to true when no override', async () => {
    expect(await createMockFlagClient().killSwitch('myapp:ks:svc')).toBe(true);
  });

  it('returns override for string', async () => {
    expect(await createMockFlagClient({ 'myapp:cfg:t': 'dark' }).string('myapp:cfg:t', 'light')).toBe('dark');
  });

  it('returns fallback for absent string key', async () => {
    expect(await createMockFlagClient().string('myapp:cfg:t', 'light')).toBe('light');
  });

  it('returns override for number', async () => {
    expect(await createMockFlagClient({ 'myapp:cfg:n': 99 }).number('myapp:cfg:n', 0)).toBe(99);
  });

  it('returns fallback for absent number key', async () => {
    expect(await createMockFlagClient().number('myapp:cfg:n', 7)).toBe(7);
  });

  it('returns json override', async () => {
    const val = { threshold: 80 };
    expect(await createMockFlagClient({ 'myapp:cfg:obj': val }).json('myapp:cfg:obj', {})).toEqual(val);
  });

  it('returns json fallback for absent key', async () => {
    const fb = { a: 1 };
    expect(await createMockFlagClient().json('myapp:cfg:obj', fb)).toEqual(fb);
  });
});

// ---------------------------------------------------------------------------
// createMockFlagsEnv
// ---------------------------------------------------------------------------

describe('createMockFlagsEnv', () => {
  it('getBooleanValue returns override', async () => {
    const env = createMockFlagsEnv({ 'myapp:ro:x': true });
    expect(await env.FLAGS.getBooleanValue('myapp:ro:x', false)).toBe(true);
  });

  it('getBooleanValue returns default for absent key', async () => {
    const env = createMockFlagsEnv();
    expect(await env.FLAGS.getBooleanValue('k', false)).toBe(false);
  });

  it('getStringValue returns default for absent key', async () => {
    expect(await createMockFlagsEnv().FLAGS.getStringValue('k', 'x')).toBe('x');
  });

  it('getNumberValue returns default for absent key', async () => {
    expect(await createMockFlagsEnv().FLAGS.getNumberValue('k', 99)).toBe(99);
  });

  it('getJSONValue returns override', async () => {
    const val = { x: 1 };
    expect(await createMockFlagsEnv({ 'k': val }).FLAGS.getJSONValue('k', {})).toEqual(val);
  });

  it('getJSONValue returns default for absent key', async () => {
    expect(await createMockFlagsEnv().FLAGS.getJSONValue('k', { z: 1 })).toEqual({ z: 1 });
  });

  it('ENVIRONMENT is always test', () => {
    expect(createMockFlagsEnv().ENVIRONMENT).toBe('test');
  });

  it('FLAG_TELEMETRY is undefined', () => {
    expect(createMockFlagsEnv().FLAG_TELEMETRY).toBeUndefined();
  });
});
