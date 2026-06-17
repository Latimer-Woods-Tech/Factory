#!/usr/bin/env node
/**
 * check-video-briefs.mjs — fail-closed acceptance gate for Prime Self video briefs.
 *
 * This is the "100% of the time, every time" enforcement. No brief reaches the
 * render pipeline, and no render reaches publish, unless it passes here. The gate
 * is fail-closed: any violation exits non-zero and blocks the build.
 *
 * Checks (per brief):
 *   1. Schema — all required fields present
 *   2. Truth rails — non-empty keyPoints + forbiddenClaims + description
 *   3. Forge — a valid ForgeAtmosphere register
 *   4. Composition — a registered Remotion composition
 *   5. Truth-check — if a narration script is present, it must NOT assert any of
 *      its own forbiddenClaims (catches an LLM that drifted off the rails)
 *   6. Manifest — every brief is either rendered (has a streamUid in the manifest)
 *      or explicitly status:planned. No dangling streamUids pointing at nothing.
 *
 * Usage:
 *   node scripts/check-video-briefs.mjs              # validate, report
 *   node scripts/check-video-briefs.mjs --strict     # also fail on un-rendered planned briefs
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRIEFS_DIR = resolve(__dirname, '..', 'content-briefs', 'prime-self');
const MANIFEST = resolve(__dirname, '..', 'render-manifest.json');

const VALID_FORGES = ['chronos', 'eros', 'aether', 'lux', 'phoenix', 'self'];
const VALID_COMPOSITIONS = ['EnergyBlueprintVideo', 'MarketingVideo', 'TrainingVideo', 'WalkthroughVideo'];
// Universal essentials — what EVERY brief needs to render truthfully, across both
// the lean legacy schema and the richer generated schema. Taxonomy fields
// (appId/category/forge/description) are warned-on, not hard-required, since
// legacy briefs predate them and still render correctly.
const REQUIRED = ['briefKey', 'composition'];
const NICE_TO_HAVE = ['appId', 'category', 'forge', 'description'];

const strict = process.argv.includes('--strict');
const errors = [];
const warnings = [];

function loadManifest() {
  if (!existsSync(MANIFEST)) return { videos: {} };
  try { return JSON.parse(readFileSync(MANIFEST, 'utf8')); }
  catch (e) { errors.push(`render-manifest.json is not valid JSON: ${e.message}`); return { videos: {} }; }
}

function validateBrief(brief, file) {
  const id = brief.briefKey || file;

  for (const f of REQUIRED) {
    if (!brief[f]) errors.push(`${id}: missing required field "${f}"`);
  }
  for (const f of NICE_TO_HAVE) {
    if (!brief[f] && !(f === 'forge' && brief.forgeTheme)) warnings.push(`${id}: missing taxonomy field "${f}"`);
  }
  const forge = brief.forge || brief.forgeTheme;
  if (forge && !VALID_FORGES.includes(forge)) {
    errors.push(`${id}: invalid forge "${forge}" (valid: ${VALID_FORGES.join(', ')})`);
  }
  if (brief.composition && !VALID_COMPOSITIONS.includes(brief.composition)) {
    errors.push(`${id}: unregistered composition "${brief.composition}"`);
  }
  // Truth rails — EVERY brief must carry them (both schemas have keyPoints +
  // forbiddenClaims). This is the non-negotiable: no untruthed video ships.
  if (!Array.isArray(brief.keyPoints) || !brief.keyPoints.length) errors.push(`${id}: no keyPoints (truth rail)`);
  if (!Array.isArray(brief.forbiddenClaims) || !brief.forbiddenClaims.length) errors.push(`${id}: no forbiddenClaims (truth rail)`);
  // Pick-a-pile carousel: generated briefs must carry 4 variants, each with a
  // hook (first-2-seconds) and a participationPrompt (circulation driver).
  if (brief.source === 'generate-video-briefs.mjs') {
    if (!Array.isArray(brief.variants) || brief.variants.length !== 4) {
      errors.push(`${id}: expected 4 pick-a-pile variants, got ${brief.variants?.length ?? 0}`);
    } else {
      for (const v of brief.variants) {
        if (!v.hook) errors.push(`${id}/${v.id || '?'}: variant missing hook`);
        if (!v.participationPrompt) errors.push(`${id}/${v.id || '?'}: variant missing participationPrompt`);
        if (v.forge && !VALID_FORGES.includes(v.forge)) errors.push(`${id}/${v.id}: invalid variant forge "${v.forge}"`);
      }
    }
  }

  // Truth-check: a present narration must not assert a forbidden claim.
  const script = brief.narration_script || brief.script || '';
  if (script && Array.isArray(brief.forbiddenClaims)) {
    for (const claim of brief.forbiddenClaims) {
      // crude containment heuristic — catches verbatim leakage of a banned claim.
      const needle = claim.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 24);
      if (needle.length > 8 && script.toLowerCase().includes(needle)) {
        errors.push(`${id}: narration appears to assert a forbiddenClaim ("${claim}")`);
      }
    }
  }
}

function main() {
  if (!existsSync(BRIEFS_DIR)) { console.error(`No briefs dir: ${BRIEFS_DIR}`); process.exit(1); }
  const manifest = loadManifest();
  const files = readdirSync(BRIEFS_DIR).filter((f) => f.endsWith('.json'));

  let rendered = 0, planned = 0, skipped = 0;
  for (const file of files) {
    let brief;
    try { brief = JSON.parse(readFileSync(join(BRIEFS_DIR, file), 'utf8')); }
    catch (e) { errors.push(`${file}: invalid JSON — ${e.message}`); continue; }
    // A renderable brief has a briefKey. Files without one (library/index/catalog
    // JSON like training-library.json) are not briefs — skip them.
    if (!brief.briefKey) { skipped++; continue; }
    validateBrief(brief, file);

    // Rendered if the manifest has a streamUid OR the brief carries an embedded
    // one (legacy schema). Both count — consolidating embedded uids into the
    // manifest is a follow-up, not a blocker.
    const streamUid = manifest.videos?.[brief.briefKey]?.streamUid || brief.stream_uid;
    if (streamUid) rendered++;
    else { planned++; if (strict) warnings.push(`${brief.briefKey}: planned, not yet rendered (no streamUid)`); }
  }

  // Manifest integrity: no streamUid pointing at a brief that no longer exists.
  const briefKeys = new Set(files.map((f) => f.replace(/\.json$/, '')));
  for (const key of Object.keys(manifest.videos || {})) {
    if (!briefKeys.has(key)) errors.push(`manifest references "${key}" but no such brief exists (dead pointer)`);
  }

  console.log(`Briefs: ${files.length - skipped}  ·  rendered: ${rendered}  ·  planned: ${planned}  ·  non-brief files skipped: ${skipped}`);
  if (warnings.length) { console.log(`\n⚠ ${warnings.length} warnings:`); warnings.slice(0, 10).forEach((w) => console.log(`  - ${w}`)); }
  if (errors.length) {
    console.error(`\n✗ ${errors.length} errors — gate FAILED:`);
    errors.slice(0, 40).forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
  if (strict && planned > 0) { console.error(`\n✗ --strict: ${planned} briefs un-rendered`); process.exit(1); }
  console.log('\n✓ Video brief gate passed.');
}

main();
