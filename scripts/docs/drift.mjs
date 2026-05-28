#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.DOCS_TARGET_ROOT ? resolve(process.env.DOCS_TARGET_ROOT) : resolve(SCRIPT_DIR, '..', '..');
const CATALOG_DIR = join(ROOT, 'docs', '_catalog');
const GRAPH_PATH = join(CATALOG_DIR, 'docs-graph.json');

const WORKFLOW_REF_RE = /(?:^|[("'`\s/])((?:\.github\/workflows\/)?[A-Za-z0-9_.-]+\.ya?ml)\b/g;
const NPM_SCRIPT_RE = /\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g;
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;

function generatedAt() {
  if (process.env.DOCS_GENERATED_AT) return process.env.DOCS_GENERATED_AT;
  try {
    return execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return new Date().toISOString();
  }
}

function toRepoPath(filePath) {
  return relative(ROOT, filePath).replace(/\\/g, '/');
}

function fromRepoPath(repoPath) {
  return join(ROOT, repoPath);
}

function loadGraph() {
  if (!existsSync(GRAPH_PATH)) {
    throw new Error('docs/_catalog/docs-graph.json is missing. Run npm run docs:catalog first.');
  }
  return JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
}

function readPackageScripts() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return new Set(Object.keys(pkg.scripts ?? {}));
}

function readPackageScriptsAt(packageJsonPath) {
  if (!existsSync(packageJsonPath)) return new Set();
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return new Set(Object.keys(pkg.scripts ?? {}));
  } catch {
    return new Set();
  }
}

function packageScriptsForDoc(docPath, rootScripts) {
  const parts = docPath.split('/');
  if ((parts[0] === 'apps' || parts[0] === 'packages') && parts.length >= 2) {
    const localScripts = readPackageScriptsAt(join(ROOT, parts[0], parts[1], 'package.json'));
    return new Set([...rootScripts, ...localScripts]);
  }
  return rootScripts;
}

function issue({ id, severity, doc, line = null, owner, status, message, fix, truthSource, blocks = [] }) {
  return {
    id,
    severity,
    doc,
    line,
    owner,
    status,
    truth_source: truthSource,
    message,
    fix,
    blocks,
  };
}

function lineForOffset(text, offset) {
  return text.slice(0, offset).split(/\r?\n/).length;
}

function normalizeWorkflowRef(raw) {
  const clean = raw.replace(/\\/g, '/');
  if (clean.startsWith('.github/workflows/')) return clean;
  return `.github/workflows/${clean}`;
}

function isHighConfidenceWorkflowRef(raw) {
  return raw.replace(/\\/g, '/').startsWith('.github/workflows/');
}

function isLikelyWorkflowFilename(raw) {
  const clean = raw.replace(/\\/g, '/');
  if (clean.includes('/')) return false;
  return /^(_|ci|deploy|doc|docs|smoke|validate|workflow|pr|codeql|publish|release|sync|generate|update|run|setup|apply|rotate|render|launch|governance|platform|package|factory|cost|revenue|morning|flaky|dependency|credential|coherence|completion|label|project|supervisor|rfc|secret|sentry|track|refresh|bootstrap|browser|capricast|cf-|auto-|dead-|dependabot|lighthouse|memory|mirror|offsite|policy|snapshot|studio)/.test(clean);
}

function resolveMarkdownTarget(docPath, rawTarget) {
  const target = rawTarget.trim().split(/\s+/)[0].replace(/^<|>$/g, '');
  if (!target || target.startsWith('#')) return null;
  if (/^(https?:|mailto:|tel:|app:\/\/)/i.test(target)) return null;
  if (target.startsWith('/')) return target.replace(/^\/+/, 'docs/');

  const withoutAnchor = target.split('#')[0];
  if (!withoutAnchor) return null;

  const docDir = dirname(fromRepoPath(docPath));
  const resolved = resolve(docDir, withoutAnchor);
  const normalizedRoot = normalize(ROOT + '/');
  if (!normalize(resolved).startsWith(normalizedRoot)) return null;
  return toRepoPath(resolved);
}

function main() {
  mkdirSync(CATALOG_DIR, { recursive: true });

  const graph = loadGraph();
  const packageScripts = readPackageScripts();
  const docsByPath = new Map(graph.docs.map((doc) => [doc.path, doc]));
  const archiveDocs = new Set(graph.docs.filter((doc) => doc.status === 'archive').map((doc) => doc.path));
  const issues = [];

  for (const doc of graph.docs) {
    if (doc.status === 'archive' || doc.status === 'generated') continue;
    const fullPath = fromRepoPath(doc.path);
    if (!existsSync(fullPath)) continue;
    const ext = extname(fullPath).toLowerCase();
    if (!['.md', '.mdx', '.yml', '.yaml'].includes(ext)) continue;

    const text = readFileSync(fullPath, 'utf8');
    const scriptsForDoc = packageScriptsForDoc(doc.path, packageScripts);
    const blocks = doc.status === 'canonical' ? ['canonical-docs'] : [];
    const canonicalSeverity = doc.status === 'canonical' ? 'error' : 'warning';

    for (const match of text.matchAll(WORKFLOW_REF_RE)) {
      const raw = match[1];
      if (!raw.endsWith('.yml') && !raw.endsWith('.yaml')) continue;
      if (!isHighConfidenceWorkflowRef(raw) && doc.path !== '.github/workflows/REGISTRY.md') continue;
      if (doc.path === '.github/workflows/REGISTRY.md' && !isHighConfidenceWorkflowRef(raw) && !isLikelyWorkflowFilename(raw)) continue;
      const workflowPath = normalizeWorkflowRef(raw);
      if (!existsSync(fromRepoPath(workflowPath))) {
        const isRegistryBareRef = doc.path === '.github/workflows/REGISTRY.md' && !isHighConfidenceWorkflowRef(raw);
        issues.push(issue({
          id: 'docs.workflow-ref.missing',
          severity: isRegistryBareRef ? 'warning' : canonicalSeverity,
          doc: doc.path,
          line: lineForOffset(text, match.index ?? 0),
          owner: doc.owner,
          status: doc.status,
          truthSource: '.github/workflows',
          message: `References missing workflow ${workflowPath}.`,
          fix: 'Update the workflow reference, restore the workflow, or move the claim to historical context.',
          blocks: isRegistryBareRef ? [] : blocks,
        }));
      }
    }

    for (const match of text.matchAll(NPM_SCRIPT_RE)) {
      const scriptName = match[1];
      if (!scriptsForDoc.has(scriptName)) {
        issues.push(issue({
          id: 'docs.npm-script.missing',
          severity: 'warning',
          doc: doc.path,
          line: lineForOffset(text, match.index ?? 0),
          owner: doc.owner,
          status: doc.status,
          truthSource: 'package.json',
          message: `References missing npm script "${scriptName}".`,
          fix: 'Update the command, add the root script to package.json, or mark it as a package-local command.',
          blocks: [],
        }));
      }
    }

    if (doc.status === 'canonical') {
      for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
        const targetPath = resolveMarkdownTarget(doc.path, match[2]);
        if (!targetPath) continue;
        const targetDoc = docsByPath.get(targetPath);
        if (targetDoc && archiveDocs.has(targetDoc.path)) {
          issues.push(issue({
            id: 'docs.canonical-links-archive',
            severity: 'error',
            doc: doc.path,
            line: lineForOffset(text, match.index ?? 0),
            owner: doc.owner,
            status: doc.status,
            truthSource: 'canonical-docs',
            message: `Canonical doc links to archive doc ${targetDoc.path}.`,
            fix: 'Link to a canonical/active source, or label the archive link as historical evidence.',
            blocks: ['canonical-docs'],
          }));
        }
      }
    }
  }

  const report = {
    version: 1,
    generated_by: 'scripts/docs/drift.mjs',
    generated_at: generatedAt(),
    ok: !issues.some((entry) => entry.severity === 'error'),
    counts: {
      issues: issues.length,
      errors: issues.filter((entry) => entry.severity === 'error').length,
      warnings: issues.filter((entry) => entry.severity === 'warning').length,
    },
    issues,
  };

  writeFileSync(join(CATALOG_DIR, 'drift.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(CATALOG_DIR, 'drift-report.md'), renderMarkdown(report));

  if (report.ok) {
    console.log(`[docs:drift] PASS (${report.counts.warnings} warning(s))`);
  } else {
    console.error(`[docs:drift] FAIL (${report.counts.errors} error(s), ${report.counts.warnings} warning(s))`);
    for (const entry of issues.filter((item) => item.severity === 'error').slice(0, 20)) {
      console.error(`  ${entry.doc}${entry.line ? `:${entry.line}` : ''} - ${entry.message}`);
    }
  }

  process.exit(report.ok ? 0 : 1);
}

function renderMarkdown(report) {
  const byOwner = new Map();
  const byId = new Map();
  for (const entry of report.issues) {
    byOwner.set(entry.owner, (byOwner.get(entry.owner) ?? 0) + 1);
    byId.set(entry.id, (byId.get(entry.id) ?? 0) + 1);
  }

  let md = '# Documentation Drift Report\n\n';
  md += `**Generated:** ${report.generated_at}\n`;
  md += `**Result:** ${report.ok ? 'PASS' : 'FAIL'}\n`;
  md += `**Errors:** ${report.counts.errors}\n`;
  md += `**Warnings:** ${report.counts.warnings}\n\n`;

  md += '## By Issue Type\n\n';
  md += '| Issue | Count |\n|---|---:|\n';
  for (const [id, count] of [...byId.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    md += `| ${id} | ${count} |\n`;
  }

  md += '\n## By Owner\n\n';
  md += '| Owner | Count |\n|---|---:|\n';
  for (const [owner, count] of [...byOwner.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    md += `| ${owner} | ${count} |\n`;
  }

  md += '\n## First 100 Issues\n\n';
  md += '| Severity | Owner | Doc | Line | Message |\n|---|---|---|---:|---|\n';
  for (const entry of report.issues.slice(0, 100)) {
    md += `| ${entry.severity} | ${entry.owner} | ${entry.doc} | ${entry.line ?? ''} | ${entry.message.replaceAll('|', '\\|')} |\n`;
  }
  return md;
}

main();
