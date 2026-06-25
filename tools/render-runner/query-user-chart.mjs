#!/usr/bin/env node
// ---------------------------------------------------------------------------
// query-user-chart.mjs — fetch one user's chart + consent from Neon.
//
// Inputs (env):
//   TARGET_USER_ID        — uuid of the user to look up
//   NEON_CONNECTION_STRING — postgres connection string (neondb_owner bypasses RLS)
//
// Output (stdout): JSON with shape:
//   { consent, displayName, hdType, definedCenters, signatureGates,
//     forgeTheme, brandColor }
//
//   consent=false  → output JSON + exit 0; caller skips the render
//   consent=true   → output JSON with all blueprint fields
//
// Exit 1 on database error or user not found.
// ---------------------------------------------------------------------------

// Gate → center lookup (mirrors geometry.ts CENTER_GATES, kept in sync manually).
const CENTER_GATES = {
  Head:        [61, 63, 64],
  Ajna:        [4, 11, 17, 24, 43, 47],
  Throat:      [8, 12, 16, 20, 23, 31, 33, 35, 45, 56, 62],
  G:           [1, 2, 7, 10, 13, 15, 25, 46],
  Heart:       [21, 26, 40, 51],
  SolarPlexus: [6, 22, 30, 36, 37, 49, 55],
  Sacral:      [3, 5, 9, 14, 27, 29, 34, 42, 59],
  Spleen:      [18, 28, 32, 44, 48, 50, 57],
  Root:        [19, 38, 39, 41, 52, 53, 54, 58, 60],
};

const GATE_TO_CENTER = {};
for (const [center, gates] of Object.entries(CENTER_GATES)) {
  for (const g of gates) GATE_TO_CENTER[g] = center;
}

const CENTER_TO_FORGE = {
  Head: 'aether', Ajna: 'chronos', Throat: 'lux', G: 'self',
  Heart: 'phoenix', Sacral: 'eros', Spleen: 'aether',
  SolarPlexus: 'eros', Root: 'chronos',
};

const TYPE_COLOR = {
  generator:             '#e8923a',
  manifesting_generator: '#d4742a',
  mg:                    '#d4742a',
  projector:             '#7b6fd4',
  manifestor:            '#c42b2b',
  reflector:             '#b8d4e8',
};

function normalizeType(raw = '') {
  const t = raw.toLowerCase().trim().replace(/\s+/g, '_').replace(/manifesting_generator|^mg$/, 'manifesting_generator');
  if (t === 'mg') return 'manifesting_generator';
  return t || 'generator';
}

// Planetary order for HD activations — sun is the most conscious/prominent.
const PLANET_ORDER = ['sun','earth','northNode','southNode','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'];

/** Derive the 1-3 most prominent gates from hd_json.
 *  Handles both array format ([{gate,line,...},...]) and the object format
 *  ({sun:{gate,line,...}, mars:{...}, ...}) used by the SELF:PRIME chart engine. */
function extractSignatureGates(hdJson) {
  const toEntries = (raw) => {
    if (!raw) return [];
    // Array format: [{gate, line, ...}, ...]
    if (Array.isArray(raw)) return raw;
    // Object format: {sun: {gate, line, ...}, mars: {gate, line, ...}, ...}
    if (typeof raw === 'object') {
      return PLANET_ORDER.map((p) => raw[p]).filter(Boolean);
    }
    return [];
  };

  const toGate = (entry) => {
    if (typeof entry === 'number') return entry;
    return entry?.gate ?? entry?.gateNumber ?? null;
  };

  const pgEntries = toEntries(hdJson?.personalityGates ?? hdJson?.variables?.conscious);
  const dgEntries = toEntries(hdJson?.designGates     ?? hdJson?.variables?.unconscious);

  const gates = [...pgEntries, ...dgEntries]
    .map(toGate)
    .filter((g) => typeof g === 'number' && g >= 1 && g <= 64);

  // Deduplicate, Personality Sun first.
  const seen = new Set();
  const unique = [];
  for (const g of gates) {
    if (!seen.has(g)) { seen.add(g); unique.push(g); }
    if (unique.length >= 3) break;
  }
  return unique;
}

function deriveForgeTheme(signatureGates) {
  const first = signatureGates[0];
  if (!first) return 'self';
  const center = GATE_TO_CENTER[first];
  return CENTER_TO_FORGE[center] ?? 'self';
}

// ── Main ───────────────────────────────────────────────────────────────────

const userId = process.env.TARGET_USER_ID;
const connStr = process.env.NEON_CONNECTION_STRING;

if (!userId) { process.stderr.write('[query-user-chart] TARGET_USER_ID not set\n'); process.exit(1); }
if (!connStr) { process.stderr.write('[query-user-chart] NEON_CONNECTION_STRING not set\n'); process.exit(1); }

const { Client } = await import('pg');
const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();

  const res = await client.query(
    `SELECT
        u.id,
        u.display_name,
        u.email,
        COALESCE(u.personalized_video_consent, false) AS consent,
        c.hd_json
      FROM users u
      LEFT JOIN charts c ON c.user_id = u.id
      WHERE u.id = $1
      LIMIT 1`,
    [userId],
  );

  if (res.rows.length === 0) {
    process.stderr.write(`[query-user-chart] user ${userId} not found\n`);
    process.exit(1);
  }

  const row = res.rows[0];
  const hdJson = row.hd_json ?? {};
  const hdType = normalizeType(hdJson.type ?? '');
  const definedCenters = hdJson.definedCenters ?? [];
  const signatureGates = extractSignatureGates(hdJson);
  const forgeTheme = deriveForgeTheme(signatureGates);
  const brandColor = TYPE_COLOR[hdType] ?? '#c9a84c';
  const displayName = row.display_name || row.email || 'you';

  const output = {
    consent:        Boolean(row.consent),
    displayName,
    hdType,
    definedCenters,
    signatureGates,
    forgeTheme,
    brandColor,
  };

  process.stdout.write(JSON.stringify(output));
} finally {
  await client.end().catch(() => {});
}
