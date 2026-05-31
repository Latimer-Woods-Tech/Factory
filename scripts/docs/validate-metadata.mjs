#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.DOCS_TARGET_ROOT ? resolve(process.env.DOCS_TARGET_ROOT) : resolve(SCRIPT_DIR, '..', '..');
const CATALOG_DIR = join(ROOT, 'docs', '_catalog');
const CANONICAL_PATH = join(ROOT, 'docs', '_governance', 'canonical-docs.yml');
const OVERRIDES_PATH = join(ROOT, 'docs', '_governance', 'doc-overrides.yml');
const TRUTH_MAP_PATH = join(ROOT, 'docs', '_catalog', 'agent-truth-map.json');

const REQUIRED_CANONICAL_FIELDS = ['path', 'owner', 'scope', 'truth_sources'];
const VALID_TRUTH_SOURCES = new Set([
  'validation-output',
  'service-registry',
  'github-workflows',
  'source-code',
  'manual-review',
]);
const VALID_STATUSES = new Set(['canonical', 'active', 'stale', 'archive', 'generated', 'scratch']);
const VALID_FIDELITY = new Set(['verified', 'generated', 'owner-reviewed', 'unverified', 'historical']);

function issue(id, severity, path, message, fix) {
  return { id, severity, path, message, fix };
}

function main() {
  mkdirSync(CATALOG_DIR, { recursive: true });
  const issues = [];

  if (!existsSync(CANONICAL_PATH)) {
    issues.push(issue('docs.metadata.canonical-missing', 'error', 'docs/_governance/canonical-docs.yml', 'Canonical allowlist is missing.', 'Create docs/_governance/canonical-docs.yml.'));
  } else {
    const config = yaml.load(readFileSync(CANONICAL_PATH, 'utf8')) ?? {};
    const entries = Array.isArray(config.canonical_docs) ? config.canonical_docs : [];
    if (entries.length === 0) {
      issues.push(issue('docs.metadata.canonical-empty', 'error', 'docs/_governance/canonical-docs.yml', 'Canonical allowlist is empty.', 'Add at least one canonical doc entry.'));
    }

    const seen = new Set();
    for (const entry of entries) {
      const entryPath = entry.path ?? '(missing path)';
      for (const field of REQUIRED_CANONICAL_FIELDS) {
        if (!entry[field] || (Array.isArray(entry[field]) && entry[field].length === 0)) {
          issues.push(issue('docs.metadata.canonical-field-missing', 'error', entryPath, `Missing required canonical field "${field}".`, `Add ${field} to ${CANONICAL_PATH}.`));
        }
      }
      if (seen.has(entryPath)) {
        issues.push(issue('docs.metadata.canonical-duplicate', 'error', entryPath, 'Duplicate canonical allowlist entry.', 'Remove the duplicate entry.'));
      }
      seen.add(entryPath);
      if (entry.path && !existsSync(join(ROOT, entry.path))) {
        issues.push(issue('docs.metadata.canonical-file-missing', 'error', entry.path, 'Canonical file does not exist.', 'Restore the file or remove it from the allowlist.'));
      }
      for (const source of entry.truth_sources ?? []) {
        if (!VALID_TRUTH_SOURCES.has(source)) {
          issues.push(issue('docs.metadata.truth-source-unknown', 'warning', entryPath, `Unknown truth source "${source}".`, 'Use a known truth source or extend validate-metadata.mjs intentionally.'));
        }
      }
    }
  }

  if (!existsSync(TRUTH_MAP_PATH)) {
    issues.push(issue('docs.metadata.truth-map-missing', 'error', 'docs/_catalog/agent-truth-map.json', 'Agent truth map is missing.', 'Create docs/_catalog/agent-truth-map.json.'));
  } else {
    const truthMap = JSON.parse(readFileSync(TRUTH_MAP_PATH, 'utf8'));
    for (const field of ['version', 'truth_order', 'default_trust', 'agent_rules']) {
      if (!truthMap[field]) {
        issues.push(issue('docs.metadata.truth-map-field-missing', 'error', TRUTH_MAP_PATH, `Agent truth map missing "${field}".`, 'Update docs/_catalog/agent-truth-map.json.'));
      }
    }
  }

  if (!existsSync(OVERRIDES_PATH)) {
    issues.push(issue('docs.metadata.overrides-missing', 'error', 'docs/_governance/doc-overrides.yml', 'Doc overrides file is missing.', 'Create docs/_governance/doc-overrides.yml.'));
  } else {
    const overrides = yaml.load(readFileSync(OVERRIDES_PATH, 'utf8')) ?? {};
    const entries = Array.isArray(overrides.overrides) ? overrides.overrides : [];
    if (entries.length === 0) {
      issues.push(issue('docs.metadata.overrides-empty', 'warning', 'docs/_governance/doc-overrides.yml', 'Doc overrides file has no overrides.', 'Add pattern-based overrides or remove the file.'));
    }
    for (const entry of entries) {
      if (!entry.pattern) {
        issues.push(issue('docs.metadata.override-pattern-missing', 'error', 'docs/_governance/doc-overrides.yml', 'Override entry is missing pattern.', 'Add a pattern to every override.'));
      }
      if (entry.status && !VALID_STATUSES.has(entry.status)) {
        issues.push(issue('docs.metadata.override-status-invalid', 'error', entry.pattern ?? OVERRIDES_PATH, `Invalid override status "${entry.status}".`, 'Use a valid status value.'));
      }
      if (entry.fidelity && !VALID_FIDELITY.has(entry.fidelity)) {
        issues.push(issue('docs.metadata.override-fidelity-invalid', 'error', entry.pattern ?? OVERRIDES_PATH, `Invalid override fidelity "${entry.fidelity}".`, 'Use a valid fidelity value.'));
      }
      if (!entry.owner && !Number.isInteger(entry.owner_from_path_segment)) {
        issues.push(issue('docs.metadata.override-owner-missing', 'warning', entry.pattern ?? OVERRIDES_PATH, 'Override has no owner or owner_from_path_segment.', 'Add owner routing so debt reports are actionable.'));
      }
    }
  }

  const report = {
    version: 1,
    generated_by: 'scripts/docs/validate-metadata.mjs',
    generated_at: new Date().toISOString(),
    ok: !issues.some((entry) => entry.severity === 'error'),
    counts: {
      issues: issues.length,
      errors: issues.filter((entry) => entry.severity === 'error').length,
      warnings: issues.filter((entry) => entry.severity === 'warning').length,
    },
    issues,
  };
  writeFileSync(join(CATALOG_DIR, 'metadata.json'), `${JSON.stringify(report, null, 2)}\n`);

  if (report.ok) {
    console.log(`[docs:metadata] PASS (${report.counts.warnings} warning(s))`);
  } else {
    console.error(`[docs:metadata] FAIL (${report.counts.errors} error(s))`);
    for (const entry of issues.filter((item) => item.severity === 'error')) {
      console.error(`  ${entry.path}: ${entry.message}`);
    }
  }

  process.exit(report.ok ? 0 : 1);
}

main();
