/**
 * Tests for AgentSessionDO — the Durable Object that hosts persistent agent sessions.
 *
 * Because the DO cannot be instantiated directly in Node/Vitest without a full
 * miniflare environment, we construct a minimal mock for `DurableObjectState`
 * that wraps an in-memory Map. This covers the HTTP route dispatch, session
 * state lifecycle, and error handling paths in the DO.
 *
 * `runLoop` from @latimer-woods-tech/agent is mocked at the module level so
 * tests don't need real LLM credentials.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentSessionDO, type SessionState } from './session.do.js';
import type { AgentResult } from '@latimer-woods-tech/agent';

// ---------------------------------------------------------------------------
// Mock runLoop so DO tests don't call the real LLM
// ---------------------------------------------------------------------------

vi.mock('@latimer-woods-tech/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@latimer-woods-tech/agent')>();
  return {
    ...actual,
    runLoop: vi.fn(),
  };
});

// Import the mock AFTER vi.mock so we can configure it per test.
import { runLoop } from '@latimer-woods-tech/agent';
const mockRunLoop = vi.mocked(runLoop);

// ---------------------------------------------------------------------------
// Minimal DO storage backed by an in-memory Map.
// Methods return resolved Promises (no async keyword, avoids require-await lint error).
// ---------------------------------------------------------------------------

interface TestStorage {
  store: Map<string, unknown>;
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list<T>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>>;
}

function makeStorage(): TestStorage {
  const store = new Map<string, unknown>();
  return {
    store,
    get<T>(key: string): Promise<T | undefined> {
      return Promise.resolve(store.get(key) as T | undefined);
    },
    put<T>(key: string, value: T): Promise<void> {
      store.set(key, value);
      return Promise.resolve();
    },
    delete(key: string): Promise<void> {
      store.delete(key);
      return Promise.resolve();
    },
    list<T>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>> {
      const prefix = options?.prefix ?? '';
      const result = new Map<string, T>();
      for (const [k, v] of store.entries()) {
        if (k.startsWith(prefix)) result.set(k, v as T);
      }
      return Promise.resolve(result);
    },
  };
}

/** Constructs a minimal DurableObjectState-like object. */
function makeDOState(sessionId = 'test-session-id') {
  return {
    storage: makeStorage(),
    id: { toString: () => sessionId },
  };
}

/** Builds a minimal LLM env for DO /run calls. */
const TEST_LLM_ENV = {
  AI_GATEWAY_BASE_URL: 'https://gateway.ai.cloudflare.com/v1/acct/prime-self',
  ANTHROPIC_API_KEY: 'test-key',
  GROQ_API_KEY: 'test-groq-key',
};

/** Builds a valid /run request body. */
function makeRunBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    messages: [{ role: 'user', content: 'hello' }],
    _llmEnv: TEST_LLM_ENV,
    ...overrides,
  });
}

/** Creates a successful AgentResult. */
function makeAgentResult(overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    content: 'I can help with that.',
    stopReason: 'end',
    turns: [],
    totalCostUsd: 0.005,
    totalTurns: 1,
    ...overrides,
  };
}

/** Type-safe JSON parse for test response bodies. */
async function parseResponse<T>(res: Response): Promise<T> {
  const raw: unknown = await res.json();
  return raw as T;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentSessionDO GET /health', () => {
  it('returns 200 with ok:true', async () => {
    const state = makeDOState();
    const do_ = new AgentSessionDO(state);
    const res = await do_.fetch(new Request('https://do/health'));
    expect(res.status).toBe(200);
    const json = await parseResponse<{ ok: boolean }>(res);
    expect(json.ok).toBe(true);
  });
});

describe('AgentSessionDO GET /history', () => {
  it('returns initial idle state when no session exists', async () => {
    const state = makeDOState('new-session');
    const do_ = new AgentSessionDO(state);
    const res = await do_.fetch(new Request('https://do/history'));
    expect(res.status).toBe(200);
    const json = await parseResponse<SessionState>(res);
    expect(json.sessionId).toBe('new-session');
    expect(json.status).toBe('idle');
    expect(json.messages).toEqual([]);
    expect(json.turns).toEqual([]);
    expect(json.totalCostUsd).toBe(0);
  });

  it('returns stored session state after a run', async () => {
    const state = makeDOState('existing-session');
    const persistedState: SessionState = {
      sessionId: 'existing-session',
      messages: [{ role: 'user', content: 'hi' }],
      turns: [],
      totalCostUsd: 0.01,
      totalTurns: 1,
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T01:00:00.000Z',
      status: 'done',
    };
    await state.storage.put('session', persistedState);
    const do_ = new AgentSessionDO(state);
    const res = await do_.fetch(new Request('https://do/history'));
    expect(res.status).toBe(200);
    const json = await parseResponse<SessionState>(res);
    expect(json.status).toBe('done');
    expect(json.totalCostUsd).toBe(0.01);
  });
});

describe('AgentSessionDO POST /reset', () => {
  it('clears session state and returns ok:true', async () => {
    const state = makeDOState('reset-session');
    const persistedState: SessionState = {
      sessionId: 'reset-session',
      messages: [{ role: 'user', content: 'old message' }],
      turns: [],
      totalCostUsd: 0.05,
      totalTurns: 2,
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T01:00:00.000Z',
      status: 'done',
    };
    await state.storage.put('session', persistedState);

    const do_ = new AgentSessionDO(state);
    const res = await do_.fetch(new Request('https://do/reset', { method: 'POST' }));
    expect(res.status).toBe(200);
    const json = await parseResponse<{ ok: boolean }>(res);
    expect(json.ok).toBe(true);

    // Verify state was cleared
    const histRes = await do_.fetch(new Request('https://do/history'));
    const histJson = await parseResponse<SessionState>(histRes);
    expect(histJson.messages).toEqual([]);
    expect(histJson.totalCostUsd).toBe(0);
    expect(histJson.status).toBe('idle');
  });
});

describe('AgentSessionDO POST /run', () => {
  beforeEach(() => {
    mockRunLoop.mockReset();
  });

  it('returns 400 for invalid JSON body', async () => {
    const state = makeDOState();
    const do_ = new AgentSessionDO(state);
    const res = await do_.fetch(
      new Request('https://do/run', {
        method: 'POST',
        body: 'not json{{{',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when _llmEnv is missing', async () => {
    const state = makeDOState();
    const do_ = new AgentSessionDO(state);
    const res = await do_.fetch(
      new Request('https://do/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
      }),
    );
    expect(res.status).toBe(400);
    const json = await parseResponse<{ error: string }>(res);
    expect(json.error).toContain('_llmEnv');
  });

  it('returns 400 for non-object body', async () => {
    const state = makeDOState();
    const do_ = new AgentSessionDO(state);
    const res = await do_.fetch(
      new Request('https://do/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify('just a string'),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('runs the loop and persists the result', async () => {
    mockRunLoop.mockResolvedValue(makeAgentResult());
    const state = makeDOState();
    const do_ = new AgentSessionDO(state);
    const res = await do_.fetch(
      new Request('https://do/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: makeRunBody(),
      }),
    );
    expect(res.status).toBe(200);
    const result = await parseResponse<AgentResult>(res);
    expect(result.content).toBe('I can help with that.');
    expect(result.stopReason).toBe('end');
    expect(result.totalCostUsd).toBe(0.005);

    // Verify session state was persisted
    const stored = await state.storage.get<SessionState>('session');
    expect(stored).toBeDefined();
    expect(stored?.status).toBe('done');
    expect(stored?.totalCostUsd).toBe(0.005);
    expect(stored?.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('returns 409 when session is already running', async () => {
    const state = makeDOState();
    const runningState: SessionState = {
      sessionId: 'busy-session',
      messages: [],
      turns: [],
      totalCostUsd: 0,
      totalTurns: 0,
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
      status: 'running',
    };
    await state.storage.put('session', runningState);
    const do_ = new AgentSessionDO(state);
    const res = await do_.fetch(
      new Request('https://do/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: makeRunBody(),
      }),
    );
    expect(res.status).toBe(409);
  });

  it('returns 429 when session budget is exhausted', async () => {
    const state = makeDOState();
    const exhaustedState: SessionState = {
      sessionId: 'broke-session',
      messages: [],
      turns: [],
      totalCostUsd: 5.0,
      totalTurns: 20,
      createdAt: '2026-06-04T00:00:00.000Z',
      updatedAt: '2026-06-04T00:00:00.000Z',
      status: 'budget_exceeded',
    };
    await state.storage.put('session', exhaustedState);
    const do_ = new AgentSessionDO(state);
    const res = await do_.fetch(
      new Request('https://do/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: makeRunBody(),
      }),
    );
    expect(res.status).toBe(429);
  });

  it('sets status to budget_exceeded when runLoop returns stopReason=budget', async () => {
    mockRunLoop.mockResolvedValue(makeAgentResult({ stopReason: 'budget' }));
    const state = makeDOState();
    const do_ = new AgentSessionDO(state);
    await do_.fetch(
      new Request('https://do/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: makeRunBody(),
      }),
    );
    const stored = await state.storage.get<SessionState>('session');
    expect(stored?.status).toBe('budget_exceeded');
  });

  it('restores idle status on unexpected runLoop error', async () => {
    mockRunLoop.mockRejectedValue(new Error('provider unavailable'));
    const state = makeDOState();
    const do_ = new AgentSessionDO(state);
    const res = await do_.fetch(
      new Request('https://do/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: makeRunBody(),
      }),
    );
    expect(res.status).toBe(500);
    const json = await parseResponse<{ error: string }>(res);
    expect(json.error).toBe('provider unavailable');

    // Status should be restored to idle so the session can be retried
    const stored = await state.storage.get<SessionState>('session');
    expect(stored?.status).toBe('idle');
  });

  it('accumulates cost and turns across multiple runs', async () => {
    mockRunLoop.mockResolvedValue(makeAgentResult({ totalCostUsd: 0.01, totalTurns: 1 }));
    const state = makeDOState();
    const do_ = new AgentSessionDO(state);

    // First run
    await do_.fetch(
      new Request('https://do/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: makeRunBody(),
      }),
    );

    // Reset to idle so we can run again
    const stored1 = await state.storage.get<SessionState>('session');
    if (stored1) {
      stored1.status = 'idle';
      await state.storage.put('session', stored1);
    }

    // Second run
    await do_.fetch(
      new Request('https://do/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: makeRunBody({ messages: [{ role: 'user', content: 'follow-up' }] }),
      }),
    );

    const stored2 = await state.storage.get<SessionState>('session');
    expect(stored2?.totalCostUsd).toBeCloseTo(0.02, 5);
    expect(stored2?.totalTurns).toBe(2);
  });

  it('passes tier and maxTurns from body to runLoop', async () => {
    mockRunLoop.mockResolvedValue(makeAgentResult());
    const state = makeDOState();
    const do_ = new AgentSessionDO(state);
    await do_.fetch(
      new Request('https://do/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: makeRunBody({ tier: 'yellow', maxTurns: 5, maxTotalCostUsd: 0.5 }),
      }),
    );
    expect(mockRunLoop).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ tier: 'yellow', maxTurns: 5, maxTotalCostUsd: 0.5 }),
    );
  });
});

describe('AgentSessionDO unknown route', () => {
  it('returns 404 for unmatched paths', async () => {
    const state = makeDOState();
    const do_ = new AgentSessionDO(state);
    const res = await do_.fetch(new Request('https://do/unknown-path'));
    expect(res.status).toBe(404);
  });
});
