#!/usr/bin/env node
/**
 * build.mjs — seed/upsert the grand video registry from content briefs.
 *
 * One record per atomic asset (briefKey x variant). Computes the rebuild
 * fingerprint (hash of every input) so drift is detectable, and UPSERTS into
 * the existing registry — preserving pipeline-set fields (render status,
 * streamUid, quality). Drift (inputs changed since render) -> status 'stale',
 * which persists until a real re-render (renderedFingerprint is stamped only by
 * render write-back).
 *
 * Idempotent: a record's meta.updatedAt only bumps when the record actually
 * changes, and the file is rewritten only if something changed — so a no-op
 * build produces an empty diff.
 *
 * Usage:
 *   node scripts/video-registry/build.mjs [--manifest "<path>/video-manifest.js"] [--check]
 *   --check : exit 1 if the committed registry differs from a fresh build (CI drift gate)
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, '..', '..');
const BRIEFS_DIR = join(APP_DIR, 'content-briefs', 'prime-self');
const REGISTRY = join(APP_DIR, 'registry', 'video-registry.json');

const sha = (s) => 'sha256:' + createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex').slice(0, 24);
const args = process.argv.slice(2);
const manifestPath = (() => { const i = args.indexOf('--manifest'); return i >= 0 ? args[i + 1] : null; })();
const checkMode = args.includes('--check');

// category prefix -> discipline / family / priority.
const CATEGORY_MAP = {
  'gate-concept':      ['human-design', 'hd-gates', 1],
  'center-concept':    ['human-design', 'hd-centers', 1],
  'type-concept':      ['human-design', 'hd-types', 1],
  'authority-concept': ['human-design', 'hd-authorities', 1],
  'strategy-concept':  ['human-design', 'hd-strategy', 2],
  'profile-concept':   ['human-design', 'hd-profiles', 2],
  'definition-concept':['human-design', 'hd-definition', 3],
  'philosophy':        ['the-library', 'library-overtones', 3],
  'synthesis':         ['cross-discipline', 'synthesis-confirmations', 2],
  'temporal':          ['astrology', 'astro-temporal', 3],
};
// Where each family is consumed in the app (placement truth). depth = taps to reach.
const SURFACES_BY_FAMILY = {
  'hd-gates':       [{ app: 'selfprime', route: '#/blueprint', component: 'oracle-video-player', trigger: 'tap gate', depth: 3 }],
  'hd-centers':     [{ app: 'selfprime', route: '#/blueprint', component: 'oracle-video-player', trigger: 'tap center', depth: 3 }],
  'app-actions':    [{ app: 'selfprime', route: '#/home', component: 'training-video-card', trigger: 'contextual card', depth: 1 }],
};
const ANALYTICS_BY_TRACK = { cinematic: ['oracle_video_played'], screencast: ['training_video_played'] };
const CINEMATIC_COMPS = new Set(['EnergyBlueprintVideo']);

function classify(brief, briefKey) {
  const cat = brief.category || briefKey.replace(/-[^-]*$/, '');
  for (const [prefix, v] of Object.entries(CATEGORY_MAP)) {
    if (cat === prefix || briefKey.startsWith(prefix)) return { discipline: v[0], family: v[1], priority: v[2] };
  }
  return { discipline: 'app', family: 'app-actions', priority: 2 };
}
const trackOf = (brief) => (CINEMATIC_COMPS.has(brief.composition) ? 'cinematic' : 'screencast');

let prev = { version: 1, generatedAt: null, assets: [] };
if (existsSync(REGISTRY)) { try { prev = JSON.parse(readFileSync(REGISTRY, 'utf8')); } catch { /* fresh */ } }
const prevById = new Map(prev.assets.map((a) => [a.id, a]));

let gateStreamUids = {};
if (manifestPath && existsSync(manifestPath)) {
  try {
    const mod = await import(pathToFileURL(resolve(manifestPath)).href);
    for (const [n, entry] of Object.entries(mod.GATE_VIDEOS || {})) {
      for (const v of (entry.variants || [])) if (v.streamUid) gateStreamUids[`gate-concept-${n}--${v.id}`] = v.streamUid;
    }
    console.log(`imported ${Object.keys(gateStreamUids).length} existing streamUids from manifest`);
  } catch (e) { console.warn('manifest import failed:', e.message); }
}

const now = new Date().toISOString();
const STREAM = 'https://customer-op4b8eq1uv0ciwqy.cloudflarestream.com';
const out = [];

for (const file of readdirSync(BRIEFS_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('VIDEO_MATRIX'))) {
  const raw = readFileSync(join(BRIEFS_DIR, file), 'utf8');
  let brief; try { brief = JSON.parse(raw); } catch { continue; }
  const briefKey = brief.briefKey || file.replace(/\.json$/, '');
  const { discipline, family, priority } = classify(brief, briefKey);
  const track = trackOf(brief);
  const briefHash = sha(raw);
  // Real provenance when the generator stamped it; else a content proxy.
  const truthHash = brief.truthHash || sha(`${brief.description || ''}|${JSON.stringify(brief.keyPoints || [])}`);
  const renderParams = { fps: 30, w: 1920, h: 1080, durationSec: brief.length_seconds || brief.duration_seconds || 50 };
  const variants = Array.isArray(brief.variants) && brief.variants.length ? brief.variants : [{ id: null, forge: brief.forge || null }];

  for (const v of variants) {
    const id = v.id ? `${briefKey}--${v.id}` : briefKey;
    const forge = v.forge || brief.forge || null;
    const fingerprint = sha([briefHash, truthHash, brief.composition, forge, v.id, renderParams, brief.script || ''].join('|'));
    const streamUid = gateStreamUids[id] || null;
    const existing = prevById.get(id);
    const pBuild = existing?.build || {};
    const pDest = existing?.destination || {};
    const uid = streamUid || pDest.streamUid || null;

    let status;
    const hadOutput = !!(uid || pDest.r2Key || ['rendered', 'qa', 'published', 'live'].includes(pBuild.status));
    if (hadOutput && pBuild.renderedFingerprint && pBuild.renderedFingerprint !== fingerprint) status = 'stale';
    else if (uid || pDest.r2Key) status = 'live';
    else status = existing && pBuild.status && pBuild.status !== 'planned' ? pBuild.status : 'brief';

    const rec = {
      id, briefKey, variant: v.id || null, track, discipline, family,
      element: brief.title || briefKey, priority,
      source: {
        truthSource: brief.truthSource || null, truthHash,
        brief: `apps/video-studio/content-briefs/prime-self/${file}`, briefHash,
        script: brief.script || null, scriptHash: brief.script ? sha(brief.script) : null,
        composition: brief.composition || null, compositionVersion: pBuild && existing?.source?.compositionVersion || null,
        forge, renderParams,
        voice: { provider: 'elevenlabs', voiceId: null, note: 'Eric — canonical narrator' },
        music: existing?.source?.music || null,
        capture: track === 'screencast' ? (existing?.source?.capture || null) : null,
      },
      build: {
        status, inputsFingerprint: fingerprint, renderedFingerprint: pBuild.renderedFingerprint || null,
        renderJobId: pBuild.renderJobId || null, workflowRun: pBuild.workflowRun || null,
        renderer: pBuild.renderer || null, renderedAt: pBuild.renderedAt || null, renderSec: pBuild.renderSec ?? null,
        rebuildCommand: `node scripts/render-brief.mjs ${briefKey}`,
      },
      destination: {
        host: uid ? 'cloudflare-stream' : (pDest.r2Key ? 'r2' : (pDest.host || null)),
        streamUid: uid, r2Key: pDest.r2Key || null,
        publicUrl: uid ? `${STREAM}/${uid}/manifest/video.m3u8` : (pDest.publicUrl || null),
        posterUrl: uid ? `${STREAM}/${uid}/thumbnails/thumbnail.jpg` : (pDest.posterUrl || null),
        surfaces: (pDest.surfaces && pDest.surfaces.length) ? pDest.surfaces : (SURFACES_BY_FAMILY[family] || []),
        analyticsEvents: (pDest.analyticsEvents && pDest.analyticsEvents.length) ? pDest.analyticsEvents : (ANALYTICS_BY_TRACK[track] || []),
      },
      quality: existing?.quality || { renderOk: null, durationMatch: null, brandScan: null, captions: null, transcript: null, wowScore: null, verifiedHttp: null, fileBytes: null, bitrateKbps: null, issues: [] },
      meta: { createdAt: existing?.meta?.createdAt || now, updatedAt: existing?.meta?.updatedAt || now, owner: 'video-studio', views: existing?.meta?.views ?? 0, engagementRate: existing?.meta?.engagementRate ?? 0, notes: existing?.meta?.notes || '' },
    };

    // Idempotency: only bump updatedAt if the record changed (ignoring updatedAt itself).
    if (existing) {
      const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); c.meta.updatedAt = null; return c; };
      if (JSON.stringify(strip(rec)) !== JSON.stringify(strip(existing))) rec.meta.updatedAt = now;
    }
    out.push(rec);
  }
}

out.sort((a, b) => (a.priority - b.priority) || a.id.localeCompare(b.id));

// Rewrite only if the asset set changed (keep generatedAt stable on no-op builds).
const prevStripped = JSON.stringify(prev.assets);
const changed = JSON.stringify(out) !== prevStripped;

if (checkMode) {
  if (changed) { console.error('✗ registry is out of date vs briefs — run build.mjs and commit.'); process.exit(1); }
  console.log('✓ registry up to date with briefs.'); process.exit(0);
}

if (!changed) {
  console.log(`✓ no changes — ${out.length} assets (registry untouched).`);
} else {
  writeFileSync(REGISTRY, JSON.stringify({ version: 1, generatedAt: now, assets: out }, null, 2) + '\n');
  const byStatus = out.reduce((m, a) => ((m[a.build.status] = (m[a.build.status] || 0) + 1), m), {});
  console.log(`✓ registry: ${out.length} assets → ${REGISTRY}`);
  console.log('  by status:', JSON.stringify(byStatus), '· stale:', out.filter((a) => a.build.status === 'stale').length);
}
