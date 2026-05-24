import { describe, it, expect, beforeEach } from 'vitest';
import { unstable_dev } from 'wrangler';
import type { Miniflare, Response } from 'miniflare';

describe('BaseRoomDO', () => {
  let worker: Miniflare;

  beforeEach(async () => {
    // Start the worker in test mode
    worker = await unstable_dev('wrangler.toml', {
      experimental: { disableExperimentalWarning: true },
    });
  });

  it('should establish a WebSocket connection and call onConnect hook', async () => {
    const response = await worker.dispatchFetch(
      'http://localhost/realtime/rooms/test-room-1/connect',
      {
        method: 'POST',
        headers: { Upgrade: 'websocket' },
      }
    );

    expect(response.status).toBe(101);
    expect(response.headers.get('Upgrade')).toBe('websocket');
  });

  it('should track session state after connection', async () => {
    const roomId = `test-room-${Date.now()}`;

    // Connect to the room
    const connectResponse = await worker.dispatchFetch(
      `http://localhost/realtime/rooms/${roomId}/connect`,
      {
        method: 'POST',
        headers: { Upgrade: 'websocket' },
      }
    );
    expect(connectResponse.status).toBe(101);

    // Fetch room state
    const stateResponse = await worker.dispatchFetch(
      `http://localhost/realtime/rooms/${roomId}/state`,
      { method: 'GET' }
    );
    expect(stateResponse.status).toBe(200);

    const state = (await stateResponse.json()) as {
      sessionCount: number;
    };
    expect(state.sessionCount).toBeGreaterThanOrEqual(1);
  });

  it('should enforce rate limiting on message bursts', async () => {
    const roomId = `test-room-${Date.now()}`;

    // Attempt to send messages beyond burst limit
    const requests = Array.from({ length: 30 }, () =>
      worker.dispatchFetch(
        `http://localhost/realtime/rooms/${roomId}/message`,
        {
          method: 'POST',
          body: JSON.stringify({ type: 'test', content: 'message' }),
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter((r) => r.status === 429);

    // At least some requests should be rate-limited
    expect(rateLimited.length).toBeGreaterThan(0);
  });

  it('should persist ring buffer entries across calls', async () => {
    const roomId = `test-room-${Date.now()}`;

    // Send a message (which adds to ring buffer)
    const sendResponse = await worker.dispatchFetch(
      `http://localhost/realtime/rooms/${roomId}/message`,
      {
        method: 'POST',
        body: JSON.stringify({ type: 'chat', content: 'Hello' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );
    expect(sendResponse.status).toBe(200);

    // Fetch buffer contents
    const bufferResponse = await worker.dispatchFetch(
      `http://localhost/realtime/rooms/${roomId}/buffer`,
      { method: 'GET' }
    );
    expect(bufferResponse.status).toBe(200);

    const buffer = (await bufferResponse.json()) as Array<{
      timestamp: number;
      data: unknown;
    }>;
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toHaveProperty('timestamp');
    expect(buffer[0]).toHaveProperty('data');
  });

  it('should clear all sessions and state on DELETE', async () => {
    const roomId = `test-room-${Date.now()}`;

    // Establish a connection
    const connectResponse = await worker.dispatchFetch(
      `http://localhost/realtime/rooms/${roomId}/connect`,
      {
        method: 'POST',
        headers: { Upgrade: 'websocket' },
      }
    );
    expect(connectResponse.status).toBe(101);

    // Verify session exists
    let stateResponse = await worker.dispatchFetch(
      `http://localhost/realtime/rooms/${roomId}/state`,
      { method: 'GET' }
    );
    let state = (await stateResponse.json()) as { sessionCount: number };
    expect(state.sessionCount).toBeGreaterThanOrEqual(1);

    // Delete the room
    const deleteResponse = await worker.dispatchFetch(
      `http://localhost/realtime/rooms/${roomId}`,
      { method: 'DELETE' }
    );
    expect(deleteResponse.status).toBe(200);

    // Verify room is reset
    stateResponse = await worker.dispatchFetch(
      `http://localhost/realtime/rooms/${roomId}/state`,
      { method: 'GET' }
    );
    state = (await stateResponse.json()) as { sessionCount: number };
    expect(state.sessionCount).toBe(0);
  });

  it('should handle tier-aware rate limiting (free vs pro)', async () => {
    const freeRoomId = `free-room-${Date.now()}`;
    const proRoomId = `pro-room-${Date.now()}`;

    // Set up free-tier room
    await worker.dispatchFetch(
      `http://localhost/realtime/rooms/${freeRoomId}/tier`,
      {
        method: 'POST',
        body: JSON.stringify({ tier: 'free' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    // Set up pro-tier room
    await worker.dispatchFetch(
      `http://localhost/realtime/rooms/${proRoomId}/tier`,
      {
        method: 'POST',
        body: JSON.stringify({ tier: 'pro' }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    // Send 15 messages to each (within free burst of 20, within pro burst of 100)
    const freeRequests = Array.from({ length: 15 }, () =>
      worker.dispatchFetch(
        `http://localhost/realtime/rooms/${freeRoomId}/message`,
        {
          method: 'POST',
          body: JSON.stringify({ type: 'test', content: 'message' }),
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const proRequests = Array.from({ length: 15 }, () =>
      worker.dispatchFetch(
        `http://localhost/realtime/rooms/${proRoomId}/message`,
        {
          method: 'POST',
          body: JSON.stringify({ type: 'test', content: 'message' }),
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const [freeResponses, proResponses] = await Promise.all([
      Promise.all(freeRequests),
      Promise.all(proRequests),
    ]);

    // Both should succeed at 15 messages (within their burst limits)
    const freeSuccess = freeResponses.filter((r) => r.status === 200).length;
    const proSuccess = proResponses.filter((r) => r.status === 200).length;

    expect(freeSuccess).toBeGreaterThan(0);
    expect(proSuccess).toBeGreaterThan(0);
    expect(proSuccess).toBeGreaterThanOrEqual(freeSuccess);
  });
});
