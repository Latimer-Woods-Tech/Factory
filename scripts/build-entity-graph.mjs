#!/usr/bin/env node
/**
 * build-entity-graph.mjs — Phase 1 (MODEL) of the Platform Brain.
 *
 * Collapses the Factory's siloed registries into ONE queryable entity graph with a
 * single canonical id per app, resolving the cross-registry ID drift
 * (prime-self = humandesign = HD = selfprime) via docs/registry/app-aliases.yml.
 *
 * Reads:
 *   docs/registry/app-aliases.yml      — canonical identity map (join key: repo)
 *   docs/service-registry.yml          — workers, pages, packages
 *   docs/app-lifecycle.yml             — lifecycle stage per app
 *   docs/conformance/summary.json      — cohesion score per repo
 *   apps/<app>/feature-registry.yml    — monorepo product registries
 *   <standalone repo>/feature-registry.yml via GitHub API (graceful 404 fallback)
 *   docs/GAP_REGISTER.md               — platform gaps (P0..P3)
 *   docs/supervisor/template-registry.yml — supervisor execution templates
 *
 * Writes:
 *   docs/registry/entity-graph.json    — { aliasIndex, nodes, edges, stats }
 *
 * Runs hourly in generate-founder-stats.yml (same auto-merge PR mechanism).
 * Node 20+ on ubuntu-latest. .github/scripts + scripts/*.mjs run on Node and are
 * exempt from the Cloudflare hard constraints (per CLAUDE.md).
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT, 'docs', 'registry', 'entity-graph.json');

const PRODUCT_KINDS = new Set(['product']);

// ─── Loaders ────────────────────────────────────────────────────────────────────

async function loadYaml(relPath) {
  const fpath = join(ROOT, relPath);
  if (!existsSync(fpath)) return null;
  try {
    return yaml.load(await readFile(fpath, 'utf8'));
  } catch (err) {
    console.warn(`WARN: failed to parse ${relPath}: ${err.message}`);
    return null;
  }
}

async function loadJson(relPath) {
  const fpath = join(ROOT, relPath);
  if (!existsSync(fpath)) return null;
  try {
    return JSON.parse(await readFile(fpath, 'utf8'));
  } catch (err) {
    console.warn(`WARN: failed to parse ${relPath}: ${err.message}`);
    return null;
  }
}

// ─── Canonical identity resolution ────────────────────────────────────────────────

function buildAliasResolver(aliasDoc) {
  const aliasIndex = {}; // lowercased alias/id -> canonical
  const byRepo = {}; // repo (lowercased) -> canonical
  const apps = {}; // canonical -> { canonical, repo, kind, conformance_key, aliases }
  const conformanceKeyToCanonical = {};

  for (const app of aliasDoc?.apps ?? []) {
    const canon = app.canonical;
    apps[canon] = app;
    aliasIndex[canon.toLowerCase()] = canon;
    if (app.repo) byRepo[app.repo.toLowerCase()] = canon;
    if (app.conformance_key) conformanceKeyToCanonical[app.conformance_key] = canon;
    for (const a of app.aliases ?? []) aliasIndex[String(a).toLowerCase()] = canon;
  }

  /** Resolve any id/name to a canonical id. Unknown ids resolve to themselves. */
  const resolve = (id) => (id == null ? null : aliasIndex[String(id).toLowerCase()] ?? String(id));
  const resolveRepo = (repo) => (repo ? byRepo[String(repo).toLowerCase()] ?? null : null);

  return { aliasIndex, apps, resolve, resolveRepo, conformanceKeyToCanonical };
}

// ─── Cohesion index (from conformance summary) ────────────────────────────────────

function buildCohesionIndex(conformance, resolver) {
  const byCanonical = {};
  for (const repo of conformance?.repos ?? []) {
    // Prefer conformance_key mapping, fall back to repo_path then repo_name.
    const canon =
      resolver.conformanceKeyToCanonical[repo.repo_key] ??
      resolver.resolveRepo(repo.repo_path) ??
      resolver.resolve(repo.repo_name);
    if (canon) {
      byCanonical[canon] = {
        cohesion: repo.cohesion,
        dimensions: (repo.dimensions ?? []).map((d) => ({ key: d.key, score: d.score, weight: d.weight })),
      };
    }
  }
  return byCanonical;
}

// ─── feature-registry loading (monorepo + standalone via API) ─────────────────────

async function loadMonorepoRegistries() {
  const out = {}; // canonicalApp (raw `app` field) -> parsed registry
  const appsDir = join(ROOT, 'apps');
  if (!existsSync(appsDir)) return out;
  const entries = await readdir(appsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fpath = join(appsDir, entry.name, 'feature-registry.yml');
    if (!existsSync(fpath)) continue;
    try {
      const reg = yaml.load(await readFile(fpath, 'utf8'));
      if (reg?.app) out[reg.app] = { ...reg, _source: `apps/${entry.name}/feature-registry.yml` };
    } catch (err) {
      console.warn(`WARN: bad feature-registry in apps/${entry.name}: ${err.message}`);
    }
  }
  return out;
}

async function fetchStandaloneRegistry(org, repo, token) {
  if (!token) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${org}/${repo}/contents/feature-registry.yml`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github.raw+json',
        'user-agent': 'factory-build-entity-graph/1.0',
      },
    });
    if (!res.ok) return null;
    const reg = yaml.load(await res.text());
    return reg?.app ? { ...reg, _source: `${org}/${repo}/feature-registry.yml` } : null;
  } catch {
    return null;
  }
}

// ─── GAP_REGISTER parsing ─────────────────────────────────────────────────────────

function parseGaps(text) {
  const gaps = [];
  let tier = null;
  for (const line of (text ?? '').split('\n')) {
    const m = line.match(/^##\s+(P[0-3])\b/);
    if (m) {
      tier = m[1].toLowerCase();
      continue;
    }
    if (tier && line.startsWith('|') && /\| (open|in-progress) /i.test(line)) {
      const cols = line.split('|').map((c) => c.trim());
      // | ID | Gap | Status | Owner | Target | Fix |  -> cols[1]=id cols[2]=gap cols[3]=status
      if (cols.length >= 4 && cols[1] && cols[1] !== 'ID' && !cols[1].startsWith('--')) {
        gaps.push({ id: cols[1], tier, title: cols[2] ?? '', status: (cols[3] ?? '').toLowerCase() });
      }
    }
  }
  return gaps;
}

// ─── Org-repo enumeration (sense-layer coverage) ──────────────────────────────────

/** List active (non-archived) org repos with their topics, via the GitHub API. */
async function listOrgRepos(org, token) {
  if (!token) return [];
  const out = [];
  for (let page = 1; page <= 5; page++) {
    let res;
    try {
      res = await fetch(`https://api.github.com/orgs/${org}/repos?per_page=100&page=${page}&type=all`, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'user-agent': 'factory-build-entity-graph/1.0',
        },
      });
    } catch {
      break;
    }
    if (!res.ok) break;
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const r of batch) {
      if (r.archived) continue;
      out.push({ name: r.name, full: r.full_name, topics: r.topics ?? [], description: r.description ?? '' });
    }
    if (batch.length < 100) break;
  }
  return out;
}

// ─── Main ──────────────────────────────────────────────────────────────────────────

async function main() {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '';

  const aliasDoc = await loadYaml('docs/registry/app-aliases.yml');
  if (!aliasDoc) throw new Error('docs/registry/app-aliases.yml is required');
  const resolver = buildAliasResolver(aliasDoc);

  const serviceRegistry = await loadYaml('docs/service-registry.yml');
  const lifecycle = await loadYaml('docs/app-lifecycle.yml');
  const conformance = await loadJson('docs/conformance/summary.json');
  const templateRegistry = await loadYaml('docs/supervisor/template-registry.yml');
  const gapText = await readFile(join(ROOT, 'docs', 'GAP_REGISTER.md'), 'utf8').catch(() => '');

  const cohesionIndex = buildCohesionIndex(conformance, resolver);
  const monoRegistries = await loadMonorepoRegistries();

  const standaloneRepos = [
    { org: 'Latimer-Woods-Tech', repo: 'HumanDesign' },
    { org: 'Latimer-Woods-Tech', repo: 'capricast' },
    { org: 'Latimer-Woods-Tech', repo: 'coh' },
    { org: 'Latimer-Woods-Tech', repo: 'xico-city' },
    { org: 'Latimer-Woods-Tech', repo: 'wordis-bond' },
    { org: 'Latimer-Woods-Tech', repo: 'kairoscouncil' },
    { org: 'Latimer-Woods-Tech', repo: 'focusbro' },
    { org: 'Latimer-Woods-Tech', repo: 'itsjusus' },
    { org: 'Latimer-Woods-Tech', repo: 'neighbor-aid' },
    { org: 'Latimer-Woods-Tech', repo: 'the-calling' },
    { org: 'Latimer-Woods-Tech', repo: 'xpelevator' },
  ];
  const standaloneRegistries = {};
  await Promise.all(
    standaloneRepos.map(async ({ org, repo }) => {
      const reg = await fetchStandaloneRegistry(org, repo, token);
      if (reg?.app) standaloneRegistries[reg.app] = reg;
    }),
  );

  // Index all feature registries by canonical app id.
  const registriesByCanonical = {};
  for (const reg of [...Object.values(monoRegistries), ...Object.values(standaloneRegistries)]) {
    registriesByCanonical[resolver.resolve(reg.app)] = reg;
  }

  // ── Build canonical app nodes (union of every source) ──
  const appNodes = {}; // canonical -> node

  const ensureApp = (canon, kindHint) => {
    if (!appNodes[canon]) {
      const aliasEntry = resolver.apps[canon];
      appNodes[canon] = {
        id: canon,
        name: canon,
        repo: aliasEntry?.repo ?? null,
        kind: aliasEntry?.kind ?? kindHint ?? 'infra',
        domain: null,
        url: null,
        healthState: 'unknown',
        lifecycleStage: null,
        mode: null, // set from app-lifecycle.yml
        maturity: null, // feature-registry stage
        cohesion: null,
        registryStatus: 'missing',
        scope: 'in-scope', // known platform component (product/infra); enumerator may override for org-scan repos
        aliases: aliasEntry?.aliases ?? [],
        packages: [],
      };
    }
    return appNodes[canon];
  };

  // Seed the known product apps so they always exist.
  for (const a of aliasDoc.apps ?? []) ensureApp(a.canonical, a.kind);

  // service-registry workers → app nodes + URLs/health
  for (const w of serviceRegistry?.workers ?? []) {
    const canon = resolver.resolveRepo(w.repo) ?? resolver.resolve(w.id);
    const node = ensureApp(canon, 'infra');
    node.name = node.name === canon ? (w.name ?? canon) : node.name;
    node.repo = node.repo ?? w.repo ?? null;
    node.url = node.url ?? w.url ?? null;
    node.domain = node.domain ?? w.custom_domain ?? null;
    if (w.health_state) node.healthState = w.health_state;
  }

  // app-lifecycle → lifecycle stage, mode, domain, name
  for (const a of lifecycle?.apps ?? []) {
    const canon = resolver.resolve(a.id);
    const node = ensureApp(canon, 'infra');
    node.lifecycleStage = a.stage ?? node.lifecycleStage;
    node.mode = a.mode ?? node.mode ?? null;
    node.domain = node.domain ?? a.custom_domain ?? null;
    if (a.name && node.name === canon) node.name = a.name;
    // Network layer wiring status — set manually in app-lifecycle.yml once
    // FACTORY_NETWORK_TOKEN is provisioned for the app. Drives missing-network-token scanner.
    if (a.network_token_configured != null) node.networkTokenConfigured = a.network_token_configured;
  }

  // feature registries → maturity, name, domain, packages, registryStatus=present
  for (const [canon, reg] of Object.entries(registriesByCanonical)) {
    const node = ensureApp(canon, 'product');
    node.registryStatus = 'present';
    node.maturity = reg.stage ?? node.maturity;
    node.name = reg.name ?? node.name;
    node.domain = reg.domain ?? node.domain;
    node.packages = reg.packages ?? node.packages;
    node.registrySource = reg._source;
  }

  // cohesion from conformance
  for (const [canon, c] of Object.entries(cohesionIndex)) {
    const node = ensureApp(canon, 'product');
    node.cohesion = c.cohesion;
    node.cohesionDimensions = c.dimensions;
  }

  // ── Org-repo enumeration: make the sense layer EVENLY applied ──
  // Every active org repo becomes a node. Repos absent from service-registry /
  // app-lifecycle / products were previously invisible — the opportunity scanner
  // could not even notice they lacked a registry. Classify each repo explicitly:
  //   in-scope   → ticketable (missing registry surfaces as an opportunity)
  //   excluded   → sense-exclusions.yml OR `platform-exclude` GitHub topic (never ticketed)
  //   denylisted → service-registry automation_denylist (FRIDGE rule 1; never ticketed)
  const exclusionsDoc = await loadYaml('docs/registry/sense-exclusions.yml');
  const excluded = new Map();
  for (const e of exclusionsDoc?.exclusions ?? []) excluded.set(String(e.repo).toLowerCase(), e.reason ?? 'excluded');
  const denyFull = new Set();
  const denyBare = new Set();
  for (const d of serviceRegistry?.automation_denylist ?? []) {
    const repo = String(d.repo ?? '').toLowerCase();
    if (!repo) continue;
    denyFull.add(repo);
    denyBare.add(repo.split('/').pop());
  }
  const ORG = 'Latimer-Woods-Tech';
  let discovered = 0;
  for (const r of await listOrgRepos(ORG, token)) {
    if (r.name.toLowerCase() === 'factory') continue; // monorepo — apps tracked individually
    const full = r.full ?? `${ORG}/${r.name}`;
    const canon = resolver.resolveRepo(full) ?? resolver.resolve(r.name);
    if (appNodes[canon]) {
      appNodes[canon].repoConfirmed = true; // already a tracked platform component
      continue;
    }
    const lc = r.name.toLowerCase();
    let scope = 'in-scope';
    let exclusionReason = null;
    if (denyFull.has(full.toLowerCase()) || denyBare.has(lc)) {
      scope = 'denylisted';
      exclusionReason = 'FRIDGE rule 1 — automation_denylist';
    } else if (excluded.has(lc)) {
      scope = 'excluded';
      exclusionReason = excluded.get(lc);
    } else if ((r.topics ?? []).includes('platform-exclude')) {
      scope = 'excluded';
      exclusionReason = 'GitHub topic: platform-exclude';
    }
    const reg = registriesByCanonical[canon];
    appNodes[canon] = {
      id: canon,
      name: r.name,
      repo: full,
      kind: 'repo',
      domain: null,
      url: null,
      healthState: 'unknown',
      lifecycleStage: null,
      maturity: reg?.stage ?? null,
      cohesion: null,
      registryStatus: reg ? 'present' : 'missing',
      scope,
      exclusionReason,
      needsRegistry: scope === 'in-scope' && !reg,
      discovered: 'org-scan',
      description: r.description || null,
      aliases: [],
      packages: reg?.packages ?? [],
    };
    discovered++;
  }

  // ── Build feature / roadmap / package / gap / template nodes + edges ──
  const features = [];
  const roadmapItems = [];
  const edges = [];
  const packageSet = new Map();

  for (const [canon, reg] of Object.entries(registriesByCanonical)) {
    for (const f of reg.features ?? []) {
      const fid = `${canon}:${f.id}`;
      features.push({ id: fid, appId: canon, label: f.label, status: f.status, tier: f.tier });
      edges.push({ from: canon, to: fid, type: 'has_feature' });
    }
    for (const r of reg.roadmap ?? []) {
      const rid = `${canon}:${r.id}`;
      roadmapItems.push({ id: rid, appId: canon, label: r.label, status: r.status, quarter: r.quarter });
      edges.push({ from: canon, to: rid, type: 'has_roadmap' });
    }
    for (const p of reg.packages ?? []) {
      edges.push({ from: canon, to: `pkg:${p}`, type: 'uses_package' });
    }
  }

  // packages from service-registry (with dependency edges where declared)
  for (const p of serviceRegistry?.packages ?? []) {
    const short = (p.name ?? '').replace('@latimer-woods-tech/', '');
    if (!short) continue;
    packageSet.set(short, { id: `pkg:${short}`, name: short, tier: p.tier ?? null });
    for (const dep of p.dependencies ?? p.deps ?? []) {
      const depShort = String(dep).replace('@latimer-woods-tech/', '');
      edges.push({ from: `pkg:${short}`, to: `pkg:${depShort}`, type: 'depends_on' });
    }
  }
  // ensure packages referenced by apps exist as nodes
  for (const e of edges) {
    if (e.type === 'uses_package' && !packageSet.has(e.to.replace('pkg:', ''))) {
      const short = e.to.replace('pkg:', '');
      packageSet.set(short, { id: e.to, name: short, tier: null });
    }
  }

  const gaps = parseGaps(gapText);
  const templates = (templateRegistry?.templates ?? []).map((t) => ({
    id: t.id,
    tier: t.tier ?? null,
    status: t.status ?? null,
  }));

  // ── Stats ──
  const appList = Object.values(appNodes);
  const products = appList.filter((a) => PRODUCT_KINDS.has(a.kind));
  const inScope = appList.filter((a) => a.scope === 'in-scope');
  const needsRegistry = appList.filter((a) => a.needsRegistry === true);
  const stats = {
    appCount: appList.length,
    productCount: products.length,
    infraCount: appList.filter((a) => a.kind === 'infra').length,
    discoveredRepoCount: appList.filter((a) => a.discovered === 'org-scan').length,
    registryPresent: appList.filter((a) => a.registryStatus === 'present').length,
    registryMissing: appList.filter((a) => a.registryStatus === 'missing').length,
    scopeInScope: inScope.length,
    scopeExcluded: appList.filter((a) => a.scope === 'excluded').length,
    scopeDenylisted: appList.filter((a) => a.scope === 'denylisted').length,
    needsRegistry: needsRegistry.length, // in-scope repos still missing a registry (ticketable)
    featureCount: features.length,
    roadmapCount: roadmapItems.length,
    packageCount: packageSet.size,
    gapCount: gaps.length,
    templateCount: templates.length,
    edgeCount: edges.length,
  };

  const output = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    aliasIndex: resolver.aliasIndex,
    nodes: {
      apps: appList.sort((a, b) => a.id.localeCompare(b.id)),
      packages: [...packageSet.values()].sort((a, b) => a.name.localeCompare(b.name)),
      features,
      roadmapItems,
      gaps,
      templates,
    },
    edges,
    stats,
  };

  await writeFile(OUT_FILE, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(
    `entity-graph.json written — ${stats.appCount} apps (${stats.productCount} product / ${stats.infraCount} infra / ${stats.discoveredRepoCount} org-scan), ` +
      `scope ${stats.scopeInScope} in / ${stats.scopeExcluded} excluded / ${stats.scopeDenylisted} denylisted, ` +
      `needsRegistry ${stats.needsRegistry}, ` +
      `${stats.featureCount} features, ${stats.gapCount} gaps, ${stats.edgeCount} edges`,
  );
}

main().catch((err) => {
  console.error('build-entity-graph failed:', err);
  process.exit(1);
});
