/**
 * AgentSessionDO — Durable Object that hosts a persistent agent session.
 *
 * Each instance = one session, keyed by caller-supplied `sessionId`. The DO:
 *  - Persists message history across requests so sessions span multiple HTTP calls.
 *  - Records a completed-turn flag before returning (crash-safe replay guard).
 *  - Enforces a session-level cost cap.
 *  - Exposes /run, /history, /reset, and /health over internal HTTP.
 *
 * ## Wire protocol (internal — called only by the Hono gateway, not by clients)
 * ```
 * POST /run       { messages, tier?, maxTurns?, maxTotalCostUsd?, _llmEnv } → AgentResult
 * GET  /history                                                              → SessionState
 * POST /reset                                                                → { ok: true }
 * GET  /health                                                               → { ok: true }
 * ```
 *
 * ## Why AgentSessionDO lives here, not in @latimer-woods-tech/agent
 *
 * The published @latimer-woods-tech/agent@0.2.0 exports `runLoop` and
 * `ToolRegistry` but not `AgentSessionDO` (that export exists only in the
 * local workspace dist, from work in-progress for a future version). Until
 * the package is bumped and published, the DO class lives in this gateway.
 * When @lwt/agent ships `AgentSessionDO`, replace this file with:
 *   export { AgentSessionDO } from '@latimer-woods-tech/agent';
 * and re-export it from src/index.ts.
 *
 * See docs/architecture/AGENT_RUNTIME.md §16 Phase 3.
 */

import {
  runLoop,
  ToolRegistry,
  type AgentResult,
  type AgentTurn,
} from '@latimer-woods-tech/agent';
import type { LLMMessage, LLMEnv } from '@latimer-woods-tech/llm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Session status lifecycle. */
type SessionStatus = 'idle' | 'running' | 'done' | 'budget_exceeded';

/** Persisted session state. */
export interface SessionState {
  sessionId: string;
  messages: LLMMessage[];
  turns: AgentTurn[];
  totalCostUsd: number;
  totalTurns: number;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
}

/** Body for POST /run requests forwarded from the gateway. */
interface RunBody {
  messages: LLMMessage[];
  tier?: 'green' | 'yellow' | 'red';
  maxTurns?: number;
  maxTotalCostUsd?: number;
  /** LLM env injected by the gateway (provider keys + AI Gateway URL). */
  _llmEnv: LLMEnv;
}

// ---------------------------------------------------------------------------
// AgentSessionDO
// ---------------------------------------------------------------------------

/** Minimal DO state shape used for type-safe storage calls. */
interface DOState {
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    put<T = unknown>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    list<T = unknown>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>>;
  };
  id: { toString(): string };
}

/**
 * Per-session Durable Object. Export this from the Worker entry module so
 * Cloudflare can bind it via:
 * ```jsonc
 * // wrangler.jsonc
 * { "name": "AGENT_SESSIONS", "class_name": "AgentSessionDO" }
 * ```
 */
export class AgentSessionDO {
  private readonly storage: DOState['storage'];
  private readonly sessionId: string;

  constructor(state: DOState) {
    this.storage = state.storage;
    this.sessionId = state.id.toString();
  }

  /**
   * HTTP handler — routes internal calls from the gateway.
   * All routes return JSON; errors are surfaces as { error: string }.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ ok: true });
    }

    if (url.pathname === '/history' && request.method === 'GET') {
      return this.handleHistory();
    }

    if (url.pathname === '/reset' && request.method === 'POST') {
      return this.handleReset();
    }

    if (url.pathname === '/run' && request.method === 'POST') {
      return this.handleRun(request);
    }

    return Response.json({ error: 'not found' }, { status: 404 });
  }

  // ---------------------------------------------------------------------------
  // Route handlers
  // ---------------------------------------------------------------------------

  /** GET /history — returns the current session state. */
  private async handleHistory(): Promise<Response> {
    const state = await this.loadState();
    return Response.json(state);
  }

  /** POST /reset — clears session state back to initial idle. */
  private async handleReset(): Promise<Response> {
    const now = new Date().toISOString();
    const fresh: SessionState = {
      sessionId: this.sessionId,
      messages: [],
      turns: [],
      totalCostUsd: 0,
      totalTurns: 0,
      createdAt: now,
      updatedAt: now,
      status: 'idle',
    };
    await this.storage.put('session', fresh);
    return Response.json({ ok: true });
  }

  /**
   * POST /run — appends the caller's messages and runs the agent loop.
   *
   * The session transitions: idle → running → done / budget_exceeded.
   * If the session is already running, returns 409 (single-turn sessions
   * reject concurrent calls).
   */
  private async handleRun(request: Request): Promise<Response> {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json({ error: 'invalid JSON body' }, { status: 400 });
    }

    // Validate the required _llmEnv field before narrowing to RunBody.
    if (
      typeof rawBody !== 'object' ||
      rawBody === null ||
      !('_llmEnv' in rawBody)
    ) {
      return Response.json({ error: '_llmEnv is required' }, { status: 400 });
    }

    const body = rawBody as RunBody;

    const state = await this.loadState();

    if (state.status === 'running') {
      return Response.json({ error: 'session is busy' }, { status: 409 });
    }

    if (state.status === 'budget_exceeded') {
      return Response.json({ error: 'session budget exhausted' }, { status: 429 });
    }

    // Append the new messages to history.
    const incoming: LLMMessage[] = body.messages ?? [];
    const allMessages: LLMMessage[] = [...state.messages, ...incoming];

    // Mark running before starting the loop (crash safety: on reload the status
    // will be 'running', which is handled correctly on resume).
    state.status = 'running';
    state.updatedAt = new Date().toISOString();
    await this.storage.put('session', state);

    let result: AgentResult;
    try {
      result = await runLoop(allMessages, {
        env: body._llmEnv,
        registry: new ToolRegistry(), // Empty registry for V1 gateway — tools added in Phase 4
        tier: body.tier ?? 'green',
        maxTurns: body.maxTurns ?? 10,
        maxTotalCostUsd: body.maxTotalCostUsd ?? 1.0,
      });
    } catch (err) {
      // Restore to idle on unexpected errors so the session can be retried.
      state.status = 'idle';
      state.updatedAt = new Date().toISOString();
      await this.storage.put('session', state);
      const message = err instanceof Error ? err.message : 'internal error';
      return Response.json({ error: message }, { status: 500 });
    }

    // Persist the completed session state.
    const newStatus: SessionStatus = result.stopReason === 'budget' ? 'budget_exceeded' : 'done';
    const updatedState: SessionState = {
      sessionId: this.sessionId,
      messages: allMessages,
      turns: [...state.turns, ...result.turns],
      totalCostUsd: state.totalCostUsd + result.totalCostUsd,
      totalTurns: state.totalTurns + result.totalTurns,
      createdAt: state.createdAt,
      updatedAt: new Date().toISOString(),
      status: newStatus,
    };
    await this.storage.put('session', updatedState);

    return Response.json(result);
  }

  // ---------------------------------------------------------------------------
  // Storage helpers
  // ---------------------------------------------------------------------------

  /** Loads existing session state or returns a fresh initial state. */
  private async loadState(): Promise<SessionState> {
    const stored = await this.storage.get<SessionState>('session');
    if (stored) return stored;

    const now = new Date().toISOString();
    return {
      sessionId: this.sessionId,
      messages: [],
      turns: [],
      totalCostUsd: 0,
      totalTurns: 0,
      createdAt: now,
      updatedAt: now,
      status: 'idle',
    };
  }
}
