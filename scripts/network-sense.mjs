#!/usr/bin/env node
/**
 * network-sense.mjs — Phase 3 (MODEL + SYNTHESIZE) of the Factory Network Layer.
 *
 * Queries the factory-network Neon project for cross-app activity and writes
 * a `network` block into docs/registry/entity-graph.json so the Platform Brain's
 * planning-session.mjs can render the "Cross-App Network" section and the
 * synergize scanner can detect gaps.
 *
 * Required env:
 *   FACTORY_NETWORK_CONNECTION_STRING — connection string for the factory-network
 *     Neon project (NETWORK_DB). Must use neondb_owner role.
 *
 * Graceful no-op when the env var is absent (dev / CI without credentials).
 * Node 20+. Exempt from Workers hard constraints (runs on Node.js in GHA).
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRAPH_FILE = join(ROOT, 'docs', 'registry', 'entity-graph.json');

const CONN = process.env.FACTORY_NETWORK_CONNECTION_STRING;

if (!CONN) {
  console.log('network-sense: FACTORY_NETWORK_CONNECTION_STRING not set — skipping (no-op).');
  process.exit(0);
}

async function query(client, sql, params = []) {
  return client.query(sql, params);
}

async function main() {
  // Use pg — available in the GHA ubuntu-latest Node environment.
  // Installed via `npm install pg --no-save` in the workflow step.
  const { Client } = require('pg');
  const client = new Client({ connectionString: CONN });
  await client.connect();

  try {
    // ── Link stats ─────────────────────────────────────────────────────────────
    const linksTotal = await query(client,
      `SELECT COUNT(*) AS n FROM factory_network_links`,
    );
    const capricastLinksTotal = await query(client,
      `SELECT COUNT(*) AS n FROM factory_network_links WHERE target_app = 'capricast' OR source_app = 'capricast'`,
    );
    const selfprimeLinksTotal = await query(client,
      `SELECT COUNT(*) AS n FROM factory_network_links WHERE target_app = 'selfprime' OR source_app = 'selfprime'`,
    );

    // ── Event stats — 7 day ────────────────────────────────────────────────────
    const selfprimeReadings7d = await query(client,
      `SELECT COUNT(*) AS n FROM factory_network_events
       WHERE app_id = 'selfprime' AND event_name = 'reading_generated'
         AND occurred_at >= now() - interval '7 days'`,
    );
    const selfprimeReadings30d = await query(client,
      `SELECT COUNT(*) AS n FROM factory_network_events
       WHERE app_id = 'selfprime' AND event_name = 'reading_generated'
         AND occurred_at >= now() - interval '30 days'`,
    );
    const capricastVideos7d = await query(client,
      `SELECT COUNT(*) AS n FROM factory_network_events
       WHERE app_id = 'capricast' AND event_name = 'video_published'
         AND occurred_at >= now() - interval '7 days'`,
    );
    const totalEvents7d = await query(client,
      `SELECT COUNT(*) AS n FROM factory_network_events WHERE occurred_at >= now() - interval '7 days'`,
    );
    const totalEventsAllTime = await query(client,
      `SELECT COUNT(*) AS n FROM factory_network_events`,
    );

    // ── Cross-app funnel: users who have emitted events AND have a verified link ─
    const crossAppFunnel = await query(client,
      `SELECT COUNT(DISTINCT e.user_id_local) AS n
       FROM factory_network_events e
       JOIN factory_network_links l
         ON l.source_app = e.app_id AND l.source_user_id = e.user_id_local
       WHERE e.occurred_at >= now() - interval '30 days'`,
    );

    // ── Unique active users in last 30d (events) → link rate denominator ────────
    const activeUsers30d = await query(client,
      `SELECT COUNT(DISTINCT user_id_local) AS n FROM factory_network_events
       WHERE occurred_at >= now() - interval '30 days'`,
    );
    const linkedUsers30d = await query(client,
      `SELECT COUNT(DISTINCT l.source_user_id) AS n
       FROM factory_network_links l
       JOIN factory_network_events e
         ON e.app_id = l.source_app AND e.user_id_local = l.source_user_id
       WHERE e.occurred_at >= now() - interval '30 days'`,
    );

    // ── Per-app event breakdown (7d) ────────────────────────────────────────────
    const appBreakdown7d = await query(client,
      `SELECT app_id, event_name, COUNT(*) AS n
       FROM factory_network_events
       WHERE occurred_at >= now() - interval '7 days'
       GROUP BY app_id, event_name
       ORDER BY n DESC
       LIMIT 20`,
    );

    const n = (res) => parseInt(res.rows[0]?.n ?? '0', 10);
    const activeUsers = n(activeUsers30d);
    const linkedUsers = n(linkedUsers30d);
    const linkRate = activeUsers > 0 ? linkedUsers / activeUsers : 0;

    const networkBlock = {
      generatedAt: new Date().toISOString(),
      links_total: n(linksTotal),
      capricast_links_total: n(capricastLinksTotal),
      selfprime_links_total: n(selfprimeLinksTotal),
      selfprime_readings_7d: n(selfprimeReadings7d),
      selfprime_readings_30d: n(selfprimeReadings30d),
      capricast_videos_7d: n(capricastVideos7d),
      total_events_7d: n(totalEvents7d),
      total_events_all_time: n(totalEventsAllTime),
      cross_app_funnel: n(crossAppFunnel),
      active_users_30d: activeUsers,
      linked_users_30d: linkedUsers,
      link_rate: parseFloat(linkRate.toFixed(4)),
      app_breakdown_7d: appBreakdown7d.rows.map((r) => ({
        app_id: r.app_id,
        event_name: r.event_name,
        count: parseInt(r.n, 10),
      })),
    };

    if (!existsSync(GRAPH_FILE)) {
      console.log('network-sense: entity-graph.json not found — run build-entity-graph.mjs first.');
      process.exit(1);
    }
    const graph = JSON.parse(await readFile(GRAPH_FILE, 'utf8'));
    graph.network = networkBlock;
    await writeFile(GRAPH_FILE, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');

    console.log(
      `network-sense: wrote graph.network — links=${networkBlock.links_total}, ` +
      `link_rate=${(linkRate * 100).toFixed(1)}%, ` +
      `cross_app_funnel=${networkBlock.cross_app_funnel}, ` +
      `readings_7d=${networkBlock.selfprime_readings_7d}, ` +
      `events_7d=${networkBlock.total_events_7d}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('network-sense failed:', err);
  process.exit(1);
});
