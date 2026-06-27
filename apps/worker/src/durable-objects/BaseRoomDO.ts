import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';

interface SessionState {
  id: string;
  userId: string;
  connectedAt: number;
  metadata?: Record<string, unknown>;
}

interface RingBufferEntry {
  timestamp: number;
  data: unknown;
}

interface RateLimitConfig {
  tier: 'free' | 'pro' | 'enterprise';
  messagesPerMinute: number;
}

/**
 * BaseRoomDO — Abstract Durable Object base class for WebSocket-based rooms.
 * Implements Hibernation API, session management, ring-buffered history,
 * tier-aware rate limiting, and broadcast helpers.
 *
 * Subclasses must implement:
 * - onConnect(session: SessionState): Promise<void>
 * - onMessage(session: SessionState, message: unknown): Promise<void>
 * - onDisconnect(session: SessionState): Promise<void>
 * - loadPersistedState(): Promise<Record<string, unknown>>
 * - persistState(state: Record<string, unknown>): Promise<void>
 */
export abstract class BaseRoomDO extends DurableObject<Env> {
  private sessions: Map<string, SessionState> = new Map();
  private ringBuffer: RingBufferEntry[] = [];
  private ringBufferMaxSize: number = 100;
  private rateLimitConfig: RateLimitConfig = {
    tier: 'free',
    messagesPerMinute: 60,
  };
  private messageCounters: Map<string, number[]> = new Map();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.ctx.acceptHibernation(server);
      await this.handleWebSocket(server, request);

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/state' && request.method === 'GET') {
      const state = await this.loadPersistedState();
      return Response.json({ sessions: Array.from(this.sessions.values()), state });
    }

    if (url.pathname === '/history' && request.method === 'GET') {
      return Response.json({ history: this.ringBuffer });
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleWebSocket(ws: WebSocket, request: Request): Promise<void> {
    const sessionId = crypto.randomUUID();
    const userId = request.headers.get('X-User-Id') || 'anonymous';

    const session: SessionState = {
      id: sessionId,
      userId,
      connectedAt: Date.now(),
      metadata: {},
    };

    this.sessions.set(sessionId, session);
    this.messageCounters.set(sessionId, []);

    try {
      await this.onConnect(session);

      ws.addEventListener('message', async (event) => {
        if (!(await this.checkRateLimit(sessionId))) {
          ws.send(JSON.stringify({ error: 'rate_limit_exceeded' }));
          return;
        }

        try {
          const message = JSON.parse(event.data as string);
          await this.onMessage(session, message);
          this.addToRingBuffer({ type: 'message', sessionId, message, timestamp: Date.now() });
        } catch (err) {
          ws.send(JSON.stringify({ error: 'invalid_message' }));
        }
      });

      ws.addEventListener('close', async () => {
        this.sessions.delete(sessionId);
        this.messageCounters.delete(sessionId);
        await this.onDisconnect(session);
        this.addToRingBuffer({ type: 'disconnect', sessionId, timestamp: Date.now() });
      });

      ws.addEventListener('error', async () => {
        this.sessions.delete(sessionId);
        this.messageCounters.delete(sessionId);
        await this.onDisconnect(session);
      });
    } catch (err) {
      ws.close(1011, 'Internal error');
      this.sessions.delete(sessionId);
      this.messageCounters.delete(sessionId);
    }
  }

  protected async broadcast(message: unknown): Promise<void> {
    const payload = JSON.stringify(message);
    const failures: string[] = [];

    for (const session of this.sessions.values()) {
      try {
        const ws = this.ctx.getWebSocket(session.id);
        if (ws) {
          ws.send(payload);
        }
      } catch (err) {
        failures.push(session.id);
      }
    }

    if (failures.length > 0) {
      console.warn(`Broadcast failures for sessions: ${failures.join(', ')}`);
    }
  }

  protected setRateLimitTier(tier: RateLimitConfig['tier']): void {
    const limits: Record<RateLimitConfig['tier'], number> = {
      free: 60,
      pro: 300,
      enterprise: 1000,
    };
    this.rateLimitConfig = {
      tier,
      messagesPerMinute: limits[tier],
    };
  }

  private async checkRateLimit(sessionId: string): Promise<boolean> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const counter = this.messageCounters.get(sessionId) || [];
    const recent = counter.filter((t) => t > oneMinuteAgo);

    if (recent.length >= this.rateLimitConfig.messagesPerMinute) {
      return false;
    }

    recent.push(now);
    this.messageCounters.set(sessionId, recent);
    return true;
  }

  private addToRingBuffer(entry: RingBufferEntry): void {
    this.ringBuffer.push(entry);
    if (this.ringBuffer.length > this.ringBufferMaxSize) {
      this.ringBuffer.shift();
    }
  }

  abstract onConnect(session: SessionState): Promise<void>;
  abstract onMessage(session: SessionState, message: unknown): Promise<void>;
  abstract onDisconnect(session: SessionState): Promise<void>;
  abstract loadPersistedState(): Promise<Record<string, unknown>>;
  abstract persistState(state: Record<string, unknown>): Promise<void>;
}
