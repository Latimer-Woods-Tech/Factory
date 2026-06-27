import { Hono } from 'hono';
import type { Env } from '../env';

const router = new Hono<{ Bindings: Env }>();

/**
 * POST /realtime/rooms/:roomId/connect
 * Upgrade to WebSocket connection for a room.
 */
router.post('/rooms/:roomId/connect', async (c) => {
  const roomId = c.req.param('roomId');
  const userId = c.req.header('X-User-Id') || 'anonymous';
  const tier = c.req.header('X-User-Tier') || 'free';

  if (!c.env.ROOMS) {
    return c.json({ error: 'ROOMS binding not configured' }, 500);
  }

  try {
    const roomDo = c.env.ROOMS.get(c.env.ROOMS.idFromName(roomId));
    const request = new Request(c.req.raw.url, {
      method: 'CONNECT',
      headers: new Headers({
        'Upgrade': 'websocket',
        'X-User-Id': userId,
        'X-User-Tier': tier,
      }),
    });

    const response = await roomDo.fetch(request);
    return response;
  } catch (err) {
    console.error(`[realtime] Failed to connect to room ${roomId}:`, err);
    return c.json({ error: 'Failed to connect' }, 500);
  }
});

/**
 * GET /realtime/rooms/:roomId/state
 * Retrieve current room state and session list.
 */
router.get('/rooms/:roomId/state', async (c) => {
  const roomId = c.req.param('roomId');

  if (!c.env.ROOMS) {
    return c.json({ error: 'ROOMS binding not configured' }, 500);
  }

  try {
    const roomDo = c.env.ROOMS.get(c.env.ROOMS.idFromName(roomId));
    const request = new Request(`${c.req.url.split('?')[0]}?path=/state`, {
      method: 'GET',
    });

    const response = await roomDo.fetch(request);
    return response;
  } catch (err) {
    console.error(`[realtime] Failed to fetch state for room ${roomId}:`, err);
    return c.json({ error: 'Failed to fetch state' }, 500);
  }
});

/**
 * GET /realtime/rooms/:roomId/history
 * Retrieve ring-buffered message history.
 */
router.get('/rooms/:roomId/history', async (c) => {
  const roomId = c.req.param('roomId');

  if (!c.env.ROOMS) {
    return c.json({ error: 'ROOMS binding not configured' }, 500);
  }

  try {
    const roomDo = c.env.ROOMS.get(c.env.ROOMS.idFromName(roomId));
    const request = new Request(`${c.req.url.split('?')[0]}?path=/history`, {
      method: 'GET',
    });

    const response = await roomDo.fetch(request);
    return response;
  } catch (err) {
    console.error(`[realtime] Failed to fetch history for room ${roomId}:`, err);
    return c.json({ error: 'Failed to fetch history' }, 500);
  }
});

/**
 * DELETE /realtime/rooms/:roomId
 * Close all connections and clean up a room.
 */
router.delete('/rooms/:roomId', async (c) => {
  const roomId = c.req.param('roomId');

  if (!c.env.ROOMS) {
    return c.json({ error: 'ROOMS binding not configured' }, 500);
  }

  try {
    const roomDo = c.env.ROOMS.get(c.env.ROOMS.idFromName(roomId));
    const request = new Request(`${c.req.url.split('?')[0]}?path=/cleanup`, {
      method: 'DELETE',
    });

    await roomDo.fetch(request);
    return c.json({ status: 'room_closed' });
  } catch (err) {
    console.error(`[realtime] Failed to close room ${roomId}:`, err);
    return c.json({ error: 'Failed to close room' }, 500);
  }
});

export default router;
