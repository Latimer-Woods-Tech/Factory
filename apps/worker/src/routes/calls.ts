// Supervisor scaffold — replace with HTTP handlers that proxy into the
// call-room DO. CODEOWNER must add the CALL_ROOM binding to wrangler
// and the corresponding env type before this route works end-to-end.
import { Hono } from "hono";
import type { Env } from "../env";

const router = new Hono<{ Bindings: Env }>();
router.get("/", (c) => c.json({ status: "scaffold", todo: "implement" }));
export default router;
