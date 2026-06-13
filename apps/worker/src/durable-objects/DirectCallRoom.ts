// Supervisor scaffold — replace with the call/live-room behavior
// described in the source issue. The CODEOWNER must wire the DO
// into wrangler.jsonc bindings before this code runs in production.
import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

export class CallRoomScaffold extends DurableObject<Env> {
  // TODO(supervisor-scaffold): replace with real state.
  async fetch(_request: Request): Promise<Response> {
    return new Response(JSON.stringify({ status: "scaffold" }), {
      headers: { "content-type": "application/json" },
    });
  }
}
