#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.DOCS_TARGET_ROOT ? resolve(process.env.DOCS_TARGET_ROOT) : resolve(SCRIPT_DIR, '..', '..');
const DOCS_DIR = join(ROOT, 'docs');
const CATALOG_DIR = join(DOCS_DIR, '_catalog');
const GOVERNANCE_DIR = join(DOCS_DIR, '_governance');
const CANONICAL_PATH = join(GOVERNANCE_DIR, 'canonical-docs.yml');
const OVERRIDES_PATH = join(GOVERNANCE_DIR, 'doc-overrides.yml');

const GENERATED_HEADER = '<!-- GENERATED FILE. Do not edit directly. Run npm run docs:catalog. -->';
const DOC_EXTS = new Set(['.md', '.mdx']);
const GENERATED_INDEXES = new Set([
  'docs/CATALOG.md',
  'docs/CANONICAL_DOCS.md',
  'docs/STALE_DOCS.md',
  'docs/OWNER_INDEX.md',
]);

function toRepoPath(filePath) {
  return relative(ROOT, filePath).replace(/\\/g, '/');
}

function sha256(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function globToRegExp(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === '*' && next === '*') {
      source += '.*';
      index++;
    } else if (char === '*') {
      source += '[^/]*';
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`${source}$`);
}

function walk(dir, results = []) {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (toRepoPath(fullPath) === 'docs/_catalog') continue;
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      walk(fullPath, results);
      continue;
    }
    if (entry.isFile() && DOC_EXTS.has(extname(entry.name))) results.push(fullPath);
  }
  return results;
}

function collectMarkdownFiles(extraRepoPaths = []) {
  const files = new Set();

  walk(DOCS_DIR).forEach((file) => files.add(file));

  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (entry.isFile() && DOC_EXTS.has(extname(entry.name))) files.add(join(ROOT, entry.name));
  }

  const promptsDir = join(ROOT, 'prompts');
  walk(promptsDir).forEach((file) => files.add(file));

  const workflowsDir = join(ROOT, '.github', 'workflows');
  walk(workflowsDir).forEach((file) => files.add(file));

  const appsDir = join(ROOT, 'apps');
  if (existsSync(appsDir)) {
    for (const entry of readdirSync(appsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const readme = join(appsDir, entry.name, 'README.md');
      if (existsSync(readme)) files.add(readme);
    }
  }

  for (const repoPath of extraRepoPaths) {
    const fullPath = join(ROOT, repoPath);
    if (existsSync(fullPath) && statSync(fullPath).isFile()) files.add(fullPath);
  }

  return [...files]
    .filter((file) => !GENERATED_INDEXES.has(toRepoPath(file)))
    .sort((a, b) => toRepoPath(a).localeCompare(toRepoPath(b)));
}

function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return {};
  const end = text.indexOf('\n---', 4);
  if (end === -1) return {};
  try {
    return yaml.load(text.slice(4, end)) ?? {};
  } catch {
    return {};
  }
}

function firstMatch(text, regex) {
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function extractTitle(text, repoPath) {
  return firstMatch(text, /^#\s+(.+)$/m) ?? basename(repoPath);
}

function extractLegacyLastUpdated(text) {
  const firstLines = text.split('\n').slice(0, 30).join('\n');
  return (
    firstMatch(firstLines, /\*?\*?Last Updated:\*?\*?\s+(\d{4}-\d{2}-\d{2})/i) ??
    firstMatch(firstLines, /\*?\*?Last updated:\*?\*?\s+(\d{4}-\d{2}-\d{2})/i)
  );
}

function normalizeStatus(value) {
  const normalized = String(value ?? '').toLowerCase().trim().replace(/\s+/g, '-');
  if (normalized === 'active-reference') return 'active';
  if (normalized === 'historical') return 'archive';
  if (['canonical', 'active', 'stale', 'archive', 'generated', 'scratch'].includes(normalized)) return normalized;
  return null;
}

function normalizeFidelity(value) {
  const normalized = String(value ?? '').toLowerCase().trim().replace(/\s+/g, '-');
  if (['verified', 'generated', 'owner-reviewed', 'unverified', 'historical'].includes(normalized)) return normalized;
  return null;
}

function inferDocType(repoPath) {
  const lower = repoPath.toLowerCase();
  if (lower.includes('/runbooks/')) return 'runbook';
  if (lower.includes('/architecture/')) return 'architecture';
  if (lower.includes('/decisions/') || lower.includes('/adr/') || lower.includes('/rfc/')) return 'decision';
  if (lower.includes('/audits/') || lower.includes('audit')) return 'audit';
  if (lower.includes('/_generated/')) return 'diagram';
  if (lower.includes('/_governance/') || lower.includes('policy')) return 'policy';
  if (lower.startsWith('prompts/')) return 'prompt';
  if (lower.endsWith('readme.md') || lower.includes('index')) return 'index';
  if (lower.includes('plan')) return 'plan';
  return 'reference';
}

function inferOwner(repoPath, canonicalEntry, frontmatter, override) {
  if (frontmatter.owner) return String(frontmatter.owner);
  if (canonicalEntry?.owner) return canonicalEntry.owner;
  if (Number.isInteger(override?.owner_from_path_segment)) {
    const segment = repoPath.split('/')[override.owner_from_path_segment];
    if (segment) return segment;
  }
  if (override?.owner) return String(override.owner);
  if (repoPath.includes('/revenue/')) return 'revenue';
  if (repoPath.includes('/architecture/')) return 'architecture';
  if (repoPath.includes('/marketing/')) return 'marketing';
  if (repoPath.includes('/admin-studio/')) return 'admin-studio';
  if (repoPath.includes('/capricast/')) return 'capricast';
  if (repoPath.includes('/runbooks/')) return 'platform';
  if (repoPath.includes('/_generated/')) return 'platform';
  if (repoPath.startsWith('.github/workflows/')) return 'platform';
  return 'unknown';
}

function inferStatus(repoPath, text, frontmatter, canonicalEntry, override) {
  if (canonicalEntry) return 'canonical';
  const fromFrontmatter = normalizeStatus(frontmatter.status);
  if (fromFrontmatter) return fromFrontmatter;
  const fromOverride = normalizeStatus(override?.status);
  if (fromOverride) return fromOverride;
  if (repoPath.includes('/_generated/') || text.includes('GENERATED FILE')) return 'generated';
  if (repoPath.includes('/archive/')) return 'archive';
  if (/(COMPLETE|COMPLETION|DELIVERY_SUMMARY|DELIVERY_COMPLETE)/.test(basename(repoPath))) return 'archive';
  return 'active';
}

function inferFidelity(status, frontmatter, canonicalEntry, override) {
  const fromFrontmatter = normalizeFidelity(frontmatter.fidelity);
  if (fromFrontmatter) return fromFrontmatter;
  const fromOverride = normalizeFidelity(override?.fidelity);
  if (fromOverride) return fromOverride;
  if (status === 'generated') return 'generated';
  if (status === 'archive') return 'historical';
  if (status === 'canonical') return canonicalEntry?.fidelity ?? 'owner-reviewed';
  return 'unverified';
}

function loadCanonicalConfig() {
  if (!existsSync(CANONICAL_PATH)) return { entries: [], map: new Map(), sourceHash: null };
  const text = readFileSync(CANONICAL_PATH, 'utf8');
  const config = yaml.load(text) ?? {};
  const entries = Array.isArray(config.canonical_docs) ? config.canonical_docs : [];
  return {
    entries,
    map: new Map(entries.map((entry) => [entry.path, entry])),
    sourceHash: sha256(text),
  };
}

function loadOverridesConfig() {
  if (!existsSync(OVERRIDES_PATH)) return { entries: [], sourceHash: null };
  const text = readFileSync(OVERRIDES_PATH, 'utf8');
  const config = yaml.load(text) ?? {};
  const entries = (Array.isArray(config.overrides) ? config.overrides : []).map((entry) => ({
    ...entry,
    regex: globToRegExp(entry.pattern),
  }));
  return { entries, sourceHash: sha256(text) };
}

function findOverride(repoPath, overrides) {
  return overrides.entries.find((entry) => entry.regex.test(repoPath)) ?? null;
}

function buildGraph() {
  const generatedAt = process.env.DOCS_GENERATED_AT ?? 'source-derived';
  const generatedAtCommit = process.env.DOCS_GENERATED_AT_COMMIT ?? null;
  const gitStatus = process.env.DOCS_GIT_STATUS ?? 'not-recorded';
  const canonical = loadCanonicalConfig();
  const overrides = loadOverridesConfig();
  const files = collectMarkdownFiles(canonical.entries.map((entry) => entry.path));

  const docs = files.map((filePath) => {
    const repoPath = toRepoPath(filePath);
    const text = readFileSync(filePath, 'utf8');
    const frontmatter = parseFrontmatter(text);
    const canonicalEntry = canonical.map.get(repoPath);
    const override = findOverride(repoPath, overrides);
    const status = inferStatus(repoPath, text, frontmatter, canonicalEntry, override);
    const fidelity = inferFidelity(status, frontmatter, canonicalEntry, override);
    const title = extractTitle(text, repoPath);
    const lastUpdated = frontmatter.last_updated ?? extractLegacyLastUpdated(text) ?? null;
    const lastVerified = frontmatter.last_verified ?? null;
    const truthSources = frontmatter.truth_source ?? canonicalEntry?.truth_sources ?? [];

    return {
      path: repoPath,
      title,
      status,
      owner: inferOwner(repoPath, canonicalEntry, frontmatter, override),
      doc_type: frontmatter.doc_type ?? override?.doc_type ?? inferDocType(repoPath),
      fidelity,
      quality: frontmatter.quality ?? (status === 'archive' ? 'rough' : 'usable'),
      last_updated: lastUpdated,
      last_verified: lastVerified,
      scope: frontmatter.scope ?? canonicalEntry?.scope ?? null,
      truth_sources: Array.isArray(truthSources) ? truthSources : [truthSources].filter(Boolean),
      verified_by: Array.isArray(frontmatter.verified_by) ? frontmatter.verified_by : [],
      content_hash: sha256(text),
      source: {
        frontmatter: Object.keys(frontmatter).length > 0,
        canonical_allowlist: Boolean(canonicalEntry),
        override: override?.pattern ?? null,
      },
      errors: [],
    };
  });

  const missingCanonical = canonical.entries
    .filter((entry) => !existsSync(join(ROOT, entry.path)))
    .map((entry) => ({
      id: 'docs.canonical.missing',
      severity: 'error',
      doc: entry.path,
      owner: entry.owner ?? 'unknown',
      status: 'canonical',
      message: 'Canonical allowlist entry does not exist on disk.',
      fix: 'Restore the file or remove it from docs/_governance/canonical-docs.yml.',
      blocks: ['canonical-docs'],
    }));

  return {
    version: 1,
    generated_by: 'scripts/docs/catalog.mjs',
    generated_at: generatedAt,
    generated_at_commit: generatedAtCommit,
    git_status: gitStatus,
    source_hashes: {
      'docs/_governance/canonical-docs.yml': canonical.sourceHash,
      'docs/_governance/doc-overrides.yml': overrides.sourceHash,
    },
    counts: {
      total_docs: docs.length,
      canonical: docs.filter((doc) => doc.status === 'canonical').length,
      active: docs.filter((doc) => doc.status === 'active').length,
      stale: docs.filter((doc) => doc.status === 'stale').length,
      archive: docs.filter((doc) => doc.status === 'archive').length,
      generated: docs.filter((doc) => doc.status === 'generated').length,
      scratch: docs.filter((doc) => doc.status === 'scratch').length,
      missing_canonical: missingCanonical.length,
    },
    errors: missingCanonical,
    docs,
  };
}

function linkTargetFromDocs(repoPath) {
  if (repoPath.startsWith('docs/')) return repoPath.slice('docs/'.length);
  return `../${repoPath}`;
}

function markdownLink(repoPath) {
  return `[${repoPath}](${linkTargetFromDocs(repoPath)})`;
}

function tableRows(docs) {
  return docs
    .map((doc) => `| ${markdownLink(doc.path)} | ${doc.status} | ${doc.fidelity} | ${doc.owner} | ${doc.last_updated ?? 'unknown'} | ${doc.title.replaceAll('|', '\\|')} |`)
    .join('\n');
}

function writeCatalogMarkdown(graph) {
  const docs = [...graph.docs].sort((a, b) => {
    const statusOrder = ['canonical', 'active', 'stale', 'generated', 'archive', 'scratch'];
    return statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) || a.path.localeCompare(b.path);
  });

  const byStatus = new Map();
  for (const doc of docs) {
    if (!byStatus.has(doc.status)) byStatus.set(doc.status, []);
    byStatus.get(doc.status).push(doc);
  }

  let md = `${GENERATED_HEADER}\n\n# Documentation Catalog\n\n`;
  md += `**Generated:** ${graph.generated_at}\n`;
  md += `**Commit:** ${graph.generated_at_commit ?? 'unknown'}\n`;
  md += `**Git status:** ${graph.git_status}\n\n`;
  md += `| Status | Count |\n|---|---:|\n`;
  for (const [key, value] of Object.entries(graph.counts)) {
    md += `| ${key} | ${value} |\n`;
  }
  md += '\n';

  for (const [status, statusDocs] of byStatus) {
    md += `## ${status[0].toUpperCase()}${status.slice(1)} Docs (${statusDocs.length})\n\n`;
    md += '| Path | Status | Fidelity | Owner | Last Updated | Title |\n|---|---|---|---|---|---|\n';
    md += `${tableRows(statusDocs)}\n\n`;
  }

  writeFileSync(join(DOCS_DIR, 'CATALOG.md'), md);
}

function writeCanonicalMarkdown(graph) {
  const docs = graph.docs.filter((doc) => doc.status === 'canonical').sort((a, b) => a.path.localeCompare(b.path));
  let md = `${GENERATED_HEADER}\n\n# Canonical Documents\n\n`;
  md += `**Generated:** ${graph.generated_at}\n\n`;
  md += 'These docs are allowlisted in `docs/_governance/canonical-docs.yml`. They are trusted only when their fidelity and health checks remain valid.\n\n';
  md += '| Path | Fidelity | Owner | Last Updated | Scope |\n|---|---|---|---|---|\n';
  md += docs
    .map((doc) => `| ${markdownLink(doc.path)} | ${doc.fidelity} | ${doc.owner} | ${doc.last_updated ?? 'unknown'} | ${(doc.scope ?? '').replaceAll('|', '\\|')} |`)
    .join('\n');
  md += '\n';
  writeFileSync(join(DOCS_DIR, 'CANONICAL_DOCS.md'), md);
}

function writeStaleMarkdown(graph) {
  const docs = graph.docs
    .filter((doc) => doc.status === 'stale' || doc.status === 'archive' || !doc.last_updated)
    .sort((a, b) => a.status.localeCompare(b.status) || a.path.localeCompare(b.path));
  let md = `${GENERATED_HEADER}\n\n# Stale And Low-Trust Docs\n\n`;
  md += `**Generated:** ${graph.generated_at}\n\n`;
  md += 'This view lists docs that are stale/archive or missing a `Last Updated`/`last_updated` signal. Archive docs are historical evidence unless re-verified.\n\n';
  md += '| Path | Status | Fidelity | Owner | Last Updated | Title |\n|---|---|---|---|---|---|\n';
  md += tableRows(docs);
  md += '\n';
  writeFileSync(join(DOCS_DIR, 'STALE_DOCS.md'), md);
}

function writeOwnerMarkdown(graph) {
  const owners = new Map();
  for (const doc of graph.docs) {
    if (!owners.has(doc.owner)) owners.set(doc.owner, []);
    owners.get(doc.owner).push(doc);
  }

  let md = `${GENERATED_HEADER}\n\n# Documentation Owner Index\n\n`;
  md += `**Generated:** ${graph.generated_at}\n\n`;

  for (const [owner, docs] of [...owners.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    md += `## ${owner} (${docs.length})\n\n`;
    md += '| Path | Status | Fidelity | Last Updated | Title |\n|---|---|---|---|---|\n';
    md += docs
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((doc) => `| ${markdownLink(doc.path)} | ${doc.status} | ${doc.fidelity} | ${doc.last_updated ?? 'unknown'} | ${doc.title.replaceAll('|', '\\|')} |`)
      .join('\n');
    md += '\n\n';
  }

  writeFileSync(join(DOCS_DIR, 'OWNER_INDEX.md'), md);
}

function main() {
  mkdirSync(CATALOG_DIR, { recursive: true });

  const graph = buildGraph();
  writeFileSync(join(CATALOG_DIR, 'docs-graph.json'), `${JSON.stringify(graph, null, 2)}\n`);
  writeCatalogMarkdown(graph);
  writeCanonicalMarkdown(graph);
  writeStaleMarkdown(graph);
  writeOwnerMarkdown(graph);

  console.log(`[docs:catalog] generated ${graph.counts.total_docs} docs (${graph.counts.canonical} canonical).`);
  if (graph.errors.length > 0) {
    console.error(`[docs:catalog] ${graph.errors.length} catalog error(s) found.`);
    process.exitCode = 1;
  }
}

main();
