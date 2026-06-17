#!/usr/bin/env node
/**
 * manage-tokens.mjs — build + rotate the least-privilege Cloudflare API token suite,
 * storing each token in GCP Secret Manager. Implements docs/_governance/cloudflare-key-policy.md.
 *
 * WHY a bootstrap token: Cloudflare's security model means a token that can CREATE tokens
 * (`User → API Tokens → Edit`) cannot itself be minted by a non-privileged token — verified:
 * both deploy tokens return HTTP 403 / code 9109 on /user/tokens. So the root of trust,
 * `CF_TOKEN_ADMIN`, is created once by hand (see scripts/cloudflare/README.md), and THIS
 * script mints + rotates the whole least-privilege suite from it. That single manual step
 * is irreducible; everything below it is automated.
 *
 * Modes:
 *   --plan    (default) resolve account/zones/permission-groups + show the intended suite. No writes.
 *   --create  create any MISSING token in the suite → write value to GCP SM → verify.
 *   --rotate  roll the value of each EXISTING suite token (PUT /value) → update GCP SM → verify.
 *   --verify  read each GCP-stored suite token and verify it against /user/tokens/verify.
 *
 * Env:
 *   CF_TOKEN_ADMIN   (required) bootstrap token: API Tokens:Edit + Account Settings:Read + Zone:Read.
 *   GCP_PROJECT      (default factory-495015) where suite token values are stored.
 *   CF_TOKEN_PREFIX  (default "factory-") name prefix for the created CF tokens.
 *
 * No token value is ever logged. Every CF call has explicit error handling.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUITE = JSON.parse(readFileSync(join(HERE, 'token-suite.json'), 'utf8'));
const MODE = process.argv.find((a) => ['--plan', '--create', '--rotate', '--verify'].includes(a)) || '--plan';
const GCP_PROJECT = process.env.GCP_PROJECT || 'factory-495015';
const PREFIX = process.env.CF_TOKEN_PREFIX || 'factory-';
const ADMIN = (process.env.CF_TOKEN_ADMIN || '').replace(/[\r\n﻿]/g, '');
const API = 'https://api.cloudflare.com/client/v4';

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
if (!ADMIN) die('CF_TOKEN_ADMIN is not set. Create the bootstrap token first (see scripts/cloudflare/README.md).');

/** Cloudflare API call with explicit error handling; returns result on success, throws on failure. */
async function cf(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error(`network error calling ${method} ${path}: ${e.message}`);
  }
  const json = await res.json().catch(() => ({}));
  if (!json.success) {
    const errs = (json.errors || []).map((e) => `${e.code}:${e.message}`).join('; ');
    throw new Error(`CF ${method} ${path} → HTTP ${res.status} ${errs || '(no error body)'}`);
  }
  return json.result;
}

/** Read every page of a paginated CF list endpoint. */
async function cfAll(path) {
  const out = [];
  for (let page = 1; page < 100; page += 1) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await cf(`${path}${sep}page=${page}&per_page=50`);
    out.push(...res);
    if (res.length < 50) break;
  }
  return out;
}

// ── GCP Secret Manager (shell out to gcloud; the established Factory pattern) ──
// CI runs this on Linux (plain `gcloud`). For local Windows runs, `gcloud` is a `.cmd`
// which execFileSync can't exec directly (EINVAL) — route through cmd.exe with args as a
// real array (no shell:true, so no DEP0190 arg-concatenation risk; args are internal
// constants anyway). cmd.exe resolves `gcloud` → `gcloud.cmd` via PATHEXT.
const WIN = process.platform === 'win32';
function gcloud(args, input) {
  const [cmd, cmdArgs] = WIN ? ['cmd.exe', ['/c', 'gcloud', ...args]] : ['gcloud', args];
  return execFileSync(cmd, cmdArgs, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}
function secretExists(name) {
  try { gcloud(['secrets', 'describe', name, `--project=${GCP_PROJECT}`]); return true; } catch { return false; }
}
function writeSecret(name, value) {
  if (!secretExists(name)) {
    gcloud(['secrets', 'create', name, `--project=${GCP_PROJECT}`, '--replication-policy=automatic']);
  }
  // printf-equivalent: pass exact bytes via stdin, no trailing newline.
  gcloud(['secrets', 'versions', 'add', name, `--project=${GCP_PROJECT}`, '--data-file=-'], value);
}
function readSecret(name) {
  return gcloud(['secrets', 'versions', 'access', 'latest', `--secret=${name}`, `--project=${GCP_PROJECT}`])
    .replace(/[\r\n﻿]/g, '');
}

async function verifyToken(value) {
  const res = await fetch(`${API}/user/tokens/verify`, { headers: { Authorization: `Bearer ${value}` } })
    .then((r) => r.json()).catch(() => ({}));
  return res.success && res.result?.status === 'active';
}

// ── Resolve the live environment from the admin token ──
async function resolveContext() {
  const accounts = await cf('/accounts');
  if (!accounts.length) die('admin token can see no accounts — needs Account Settings:Read.');
  const account = accounts[0];
  const zones = await cfAll('/zones');
  const groups = await cfAll('/user/tokens/permission_groups');
  const byName = new Map(groups.map((g) => [g.name.toLowerCase(), g]));
  return { account, zones, byName };
}

function resolveGroups(names, byName) {
  return names.map((n) => {
    const g = byName.get(n.toLowerCase());
    if (!g) die(`permission group not found: "${n}" — run --plan to list available groups, or fix token-suite.json.`);
    return { id: g.id, name: g.name };
  });
}

function resourcesFor(scope, account) {
  if (scope === 'account') return { [`com.cloudflare.api.account.${account.id}`]: '*' };
  if (scope === 'zones') return { 'com.cloudflare.api.account.zone.*': '*' };
  die(`unknown policy scope "${scope}" (use "account" or "zones")`);
  return null;
}

function buildPolicies(spec, ctx) {
  return spec.policies.map((p) => ({
    effect: 'allow',
    resources: resourcesFor(p.scope, ctx.account),
    permission_groups: resolveGroups(p.permission_groups, ctx.byName),
  }));
}

async function main() {
  console.log(`Cloudflare token suite — mode ${MODE}, project ${GCP_PROJECT}\n`);
  const ctx = await resolveContext();
  console.log(`account: ${ctx.account.name} (${ctx.account.id}) · zones: ${ctx.zones.length} · permission groups: ${ctx.byName.size}\n`);
  const existing = await cf('/user/tokens');
  const byTokenName = new Map(existing.map((t) => [t.name, t]));

  let changed = 0;
  for (const spec of SUITE.tokens) {
    const cfName = `${PREFIX}${spec.name}`;
    const found = byTokenName.get(cfName);
    const tag = `${spec.secret} (${cfName})`;

    if (MODE === '--plan') {
      const policies = buildPolicies(spec, ctx); // validates group names exist
      const perms = policies.flatMap((p) => p.permission_groups.map((g) => g.name)).join(', ');
      console.log(`• ${tag}\n    exists: ${found ? 'yes' : 'NO — would create'} · perms: ${perms}`);
      continue;
    }

    if (MODE === '--create') {
      if (found) { console.log(`= ${tag} exists — skip`); continue; }
      const result = await cf('/user/tokens', { method: 'POST', body: { name: cfName, policies: buildPolicies(spec, ctx) } });
      writeSecret(spec.secret, result.value);
      const ok = await verifyToken(result.value);
      console.log(`${ok ? '✓' : '✗'} ${tag} created${ok ? ' + verified active' : ' but verify FAILED'} → GCP SM`);
      if (!ok) process.exitCode = 1;
      changed += 1;
    }

    if (MODE === '--rotate') {
      if (!found) { console.log(`! ${tag} does not exist — run --create first`); process.exitCode = 1; continue; }
      const result = await cf(`/user/tokens/${found.id}/value`, { method: 'PUT', body: {} });
      writeSecret(spec.secret, result);
      const ok = await verifyToken(result);
      console.log(`${ok ? '✓' : '✗'} ${tag} rotated${ok ? ' + verified active' : ' but verify FAILED'} → GCP SM`);
      if (!ok) process.exitCode = 1;
      changed += 1;
    }

    if (MODE === '--verify') {
      if (!secretExists(spec.secret)) { console.log(`! ${tag} not in GCP SM`); process.exitCode = 1; continue; }
      const ok = await verifyToken(readSecret(spec.secret));
      console.log(`${ok ? '✓' : '✗'} ${tag} ${ok ? 'active' : 'INVALID'}`);
      if (!ok) process.exitCode = 1;
    }
  }

  if (MODE === '--plan') console.log(`\nPlan only — no changes. Run --create to mint, --rotate to roll, --verify to check.`);
  else if (['--create', '--rotate'].includes(MODE)) console.log(`\n${changed} token(s) ${MODE === '--create' ? 'created' : 'rotated'}.`);
}

main().catch((e) => die(e.message));
