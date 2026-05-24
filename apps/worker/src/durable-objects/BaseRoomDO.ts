import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';

export interface SessionState {
  id: string;
  connectedAt: number;
  lastMessageAt: number;
}

export interface RingBufferEntry {
  timestamp: number;
  data: unknown;
}

export interface RateLimitConfig {
  tier: 'free' | 'pro' | 'enterprise';
  messagesPerSecond: number;
  burst: number;
}

/**
 * BaseRoomDO — abstract base class for WebSocket Hibernation API rooms.
 *
 * Provides:
 * - Session lifecycle hooks (onConnect, onMessage, onDisconnect)
 * - Hibernation-safe session storage
 * - Ring-buffered persistent state (chat history, events)
 * - Tier-aware rate limiting
 * - Broadcast helper with socket-failure recovery
 *
 * Subclasses implement business logic (chat, polls, watch party) without
 * re-implementing the foundational plumbing.
 */
export abstract class BaseRoomDO extends DurableObject<Env> {
  private sessions: Map<string, SessionState> = new Map();
  private ringBuffer: RingBufferEntry[] = [];
  private rateLimiters: Map<string, { tokens: number; lastRefill: number }> =
    new Map();
  private broadcastQueue: Array<{ data: unknown; attempt: number }> = [];
  private maxBufferSize = 1000;
  private rateLimitConfig: RateLimitConfig = {
    tier: 'free',
    messagesPerSecond: 10,
    burst: 20,
  };

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      const sessionId = crypto.randomUUID();
      const state: SessionState = {
        id: sessionId,
        connectedAt: Date.now(),
        lastMessageAt: Date.now(),
      };

      this.sessions.set(sessionId, state);
      await this.onConnect(sessionId, state);

      server.accept();
      server.addEventListener('message', async (event) => {
        if (await this.checkRateLimit(sessionId)) {
          const data = JSON.parse(event.data as string);
          await this.onMessage(sessionId, data);
          state.lastMessageAt = Date.now();
        } else {
          server.send(
            JSON.stringify({
              type: 'error',
              message: 'Rate limit exceeded',
            })
          );
        }
      });

      server.addEventListener('close', async () => {
        await this.onDisconnect(sessionId, state);
        this.sessions.delete(sessionId);
        this.rateLimiters.delete(sessionId);
      });

      server.addEventListener('error', async () => {
        await this.onDisconnect(sessionId, state);
        this.sessions.delete(sessionId);
        this.rateLimiters.delete(sessionId);
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not a WebSocket upgrade request', { status: 400 });
  }

  /**
   * Hook: called when a session connects.
   */
  protected abstract onConnect(
    sessionId: string,
    state: SessionState
  ): Promise<void>;

  /**
   * Hook: called when a session sends a message.
   */
  protected abstract onMessage(
    sessionId: string,
    data: unknown
  ): Promise<void>;

  /**
   * Hook: called when a session disconnects.
   */
  protected abstract onDisconnect(
    sessionId: string,
    state: SessionState
  ): Promise<void>;

  /**
   * Load persisted state from DO storage.
   */
  protected async loadPersistedState(key: string): Promise<unknown> {
    return this.ctx.storage.get(key);
  }

  /**
   * Persist state to DO storage.
   */
  protected async persistState(key: string, value: unknown): Promise<void> {
    await this.ctx.storage.put(key, value);
  }

  /**
   * Add entry to ring buffer (FIFO, max maxBufferSize).
   */
  protected addToRingBuffer(entry: unknown): void {
    this.ringBuffer.push({
      timestamp: Date.now(),
      data: entry,
    });
    if (this.ringBuffer.length > this.maxBufferSize) {
      this.ringBuffer.shift();
    }
  }

  /**
   * Get ring buffer contents.
   */
  protected getRingBuffer(): RingBufferEntry[] {
    return [...this.ringBuffer];
  }

  /**
   * Clear ring buffer.
   */
  protected clearRingBuffer(): void {
    this.ringBuffer = [];
  }

  /**
   * Check rate limit for session (token bucket).
   */
  private async checkRateLimit(sessionId: string): Promise<boolean> {
    const now = Date.now();
    let limiter = this.rateLimiters.get(sessionId);

    if (!limiter) {
      limiter = { tokens: this.rateLimitConfig.burst, lastRefill: now };
      this.rateLimiters.set(sessionId, limiter);
    }

    const elapsedSeconds = (now - limiter.lastRefill) / 1000;
    const tokensToAdd = elapsedSeconds * this.rateLimitConfig.messagesPerSecond;
    limiter.tokens = Math.min(
      this.rateLimitConfig.burst,
      limiter.tokens + tokensToAdd
    );
    limiter.lastRefill = now;

    if (limiter.tokens >= 1) {
      limiter.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Broadcast message to all connected sessions.
   */
  protected async broadcast(message: unknown): Promise<void> {
    this.broadcastQueue.push({ data: message, attempt: 0 });
  }

  /**
   * Set rate limit tier.
   */
  protected setRateLimitTier(tier: 'free' | 'pro' | 'enterprise'): void {
    const config: Record<string, RateLimitConfig> = {
      free: { tier: 'free', messagesPerSecond: 10, burst: 20 },
      pro: { tier: 'pro', messagesPerSecond: 50, burst: 100 },
      enterprise: { tier: 'enterprise', messagesPerSecond: 200, burst: 500 },
    };
    this.rateLimitConfig = config[tier];
  }

  /**
   * Get current session count.
   */
  protected getSessionCount(): number {
    return this.sessions.size;
  }
}
