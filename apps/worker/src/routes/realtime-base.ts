import { Hono } from 'hono';
import type { Env } from '../env';

/**
 * Route module for BaseRoomDO.
 *
 * This is a reference implementation showing how to wire a BaseRoomDO subclass
 * to HTTP endpoints. Concrete subclasses (e.g., VideoRoom, ConferenceRoom)
 * will follow this pattern.
 */

const router = new Hono<{ Bindings: Env }>();

/**
 * POST /realtime/rooms/:roomId/connect
 * Upgrade to WebSocket and connect to the room DO.
 */
router.post('/rooms/:roomId/connect', async (c) => {
  const { roomId } = c.req.param();

  if (c.req.header('Upgrade') !== 'websocket') {
    return c.text('This endpoint requires a WebSocket upgrade', 400);
  }

  // Get or create DO stub for this room
  const roomDO = c.env.REALTIME_ROOMS.get(
    c.env.REALTIME_ROOMS.idFromName(roomId)
  );

  // Forward the WebSocket upgrade request to the DO
  return roomDO.fetch(c.req.raw);
});

/**
 * GET /realtime/rooms/:roomId/state
 * Fetch current room state (session count, buffer contents).
 */
router.get('/rooms/:roomId/state', async (c) => {
  const { roomId } = c.req.param();

  const roomDO = c.env.REALTIME_ROOMS.get(
    c.env.REALTIME_ROOMS.idFromName(roomId)
  );

  const response = await roomDO.fetch(
    new Request(new URL(`${c.req.url}/../state`).toString(), {
      method: 'GET',
    })
  );

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});

/**
 * DELETE /realtime/rooms/:roomId
 * Tear down the room (clear all sessions and persisted state).
 */
router.delete('/rooms/:roomId', async (c) => {
  const { roomId } = c.req.param();

  const roomDO = c.env.REALTIME_ROOMS.get(
    c.env.REALTIME_ROOMS.idFromName(roomId)
  );

  const response = await roomDO.fetch(
    new Request(new URL(`${c.req.url}`).toString(), {
      method: 'DELETE',
    })
  );

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
});

export default router;
