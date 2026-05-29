#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.DOCS_TARGET_ROOT ? resolve(process.env.DOCS_TARGET_ROOT) : resolve(SCRIPT_DIR, '..', '..');
const DOCS_DIR = join(ROOT, 'docs');
const GENERATED_DIR = join(DOCS_DIR, '_generated');
const REGISTRY_PATH = join(DOCS_DIR, 'service-registry.yml');
const WORKFLOWS_DIR = join(ROOT, '.github', 'workflows');
const GRAPH_PATH = join(DOCS_DIR, '_catalog', 'docs-graph.json');

const HEADER = '<!-- GENERATED FILE. Do not edit directly. Run npm run docs:diagrams. -->';

function generatedAt() {
  if (process.env.DOCS_GENERATED_AT) return process.env.DOCS_GENERATED_AT;
  try {
    return execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return new Date().toISOString();
  }
}

function sha256(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function safeId(value) {
  return String(value).replace(/[^A-Za-z0-9_]/g, '_');
}

function fileHash(path) {
  return sha256(readFileSync(path, 'utf8'));
}

function frontmatter({ title, sources }) {
  const date = generatedAt().slice(0, 10);
  return `---\nstatus: generated\nowner: platform\ndoc_type: diagram\nfidelity: generated\ntitle: ${JSON.stringify(title)}\ngenerator: npm run docs:diagrams\nlast_generated: ${date}\nsource:\n${sources.map((source) => `  - ${source}`).join('\n')}\n---`;
}

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return {};
  return yaml.load(readFileSync(REGISTRY_PATH, 'utf8')) ?? {};
}

function loadGraph() {
  if (!existsSync(GRAPH_PATH)) return null;
  return JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
}

function workflowFiles() {
  if (!existsSync(WORKFLOWS_DIR)) return [];
  return readdirSync(WORKFLOWS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.yml'))
    .map((entry) => entry.name)
    .sort();
}

function workflowTier(name) {
  if (name.startsWith('_')) return 'Reusable';
  if (name.startsWith('deploy-')) return 'Deploy';
  if (name.includes('smoke') || name.includes('health') || name.includes('quality') || name.includes('validate')) return 'Quality';
  if (name.includes('digest') || name.includes('scorecard') || name.includes('state') || name.includes('report')) return 'Reporting';
  if (name.includes('sync') || name.includes('loop') || name.includes('automation')) return 'Automation';
  return 'Other';
}

function serviceMap() {
  if (!existsSync(REGISTRY_PATH)) return false;
  const registryText = readFileSync(REGISTRY_PATH, 'utf8');
  const registry = loadRegistry();
  const workers = Array.isArray(registry.workers) ? registry.workers : [];
  const pages = Array.isArray(registry.pages) ? registry.pages : [];

  let md = `${HEADER}\n\n`;
  md += `${frontmatter({ title: 'Factory Service Map', sources: ['docs/service-registry.yml'] })}\n\n`;
  md += '# Factory Service Map\n\n';
  md += `**Source hash:** \`${sha256(registryText)}\`\n\n`;
  md += '```mermaid\nflowchart LR\n';
  md += '  registry["docs/service-registry.yml"]\n';
  md += '  workers["Workers"]\n';
  md += '  pages["Pages"]\n';
  md += '  registry --> workers\n';
  md += '  registry --> pages\n';

  for (const worker of workers.slice(0, 80)) {
    const id = safeId(`worker_${worker.id ?? worker.name}`);
    const label = `${worker.id ?? worker.name}\\n${worker.url ?? worker.workers_dev_url ?? 'url unknown'}`;
    md += `  workers --> ${id}["${label.replaceAll('"', "'")}"]\n`;
  }

  for (const page of pages.slice(0, 40)) {
    const id = safeId(`page_${page.id ?? page.name}`);
    const label = `${page.id ?? page.name}\\n${page.url ?? page.domain ?? 'url unknown'}`;
    md += `  pages --> ${id}["${label.replaceAll('"', "'")}"]\n`;
  }

  md += '```\n';
  writeFileSync(join(GENERATED_DIR, 'service-map.md'), md);
  return true;
}

function workflowMap() {
  const files = workflowFiles();
  if (files.length === 0) return false;
  const registryHash = existsSync(join(WORKFLOWS_DIR, 'REGISTRY.md')) ? fileHash(join(WORKFLOWS_DIR, 'REGISTRY.md')) : null;

  let md = `${HEADER}\n\n`;
  md += `${frontmatter({ title: 'Factory Workflow Map', sources: ['.github/workflows/*.yml', '.github/workflows/REGISTRY.md'] })}\n\n`;
  md += '# Factory Workflow Map\n\n';
  if (registryHash) md += `**Registry hash:** \`${registryHash}\`\n\n`;
  md += '```mermaid\nflowchart TB\n';

  const tiers = [...new Set(files.map(workflowTier))].sort();
  for (const tier of tiers) {
    md += `  ${safeId(tier)}["${tier}"]\n`;
  }
  for (const file of files) {
    const tier = workflowTier(file);
    md += `  ${safeId(tier)} --> ${safeId(file)}["${file}"]\n`;
  }

  md += '```\n';
  writeFileSync(join(GENERATED_DIR, 'workflow-map.md'), md);
  return true;
}

function docsTrustMap() {
  const graph = loadGraph();
  const counts = graph?.counts ?? {};
  let md = `${HEADER}\n\n`;
  md += `${frontmatter({ title: 'Factory Documentation Trust Map', sources: ['docs/_catalog/docs-graph.json', 'docs/_governance/canonical-docs.yml'] })}\n\n`;
  md += '# Factory Documentation Trust Map\n\n';
  md += 'This diagram is generated from the docs graph. It intentionally omits the graph hash to avoid self-referential churn because the graph includes generated diagram content hashes.\n\n';
  md += '```mermaid\nflowchart LR\n';
  md += '  truth["Truth Sources"] --> canonical["Canonical Docs"]\n';
  md += '  canonical --> active["Active Docs"]\n';
  md += '  active --> stale["Stale Docs"]\n';
  md += '  stale --> archive["Archive Docs"]\n';
  md += `  canonical["Canonical Docs\\n${counts.canonical ?? 0}"]\n`;
  md += `  active["Active Docs\\n${counts.active ?? 0}"]\n`;
  md += `  stale["Stale Docs\\n${counts.stale ?? 0}"]\n`;
  md += `  archive["Archive Docs\\n${counts.archive ?? 0}"]\n`;
  md += `  generated["Generated Docs\\n${counts.generated ?? 0}"]\n`;
  md += '  truth --> generated\n';
  md += '  generated --> canonical\n';
  md += '```\n';
  writeFileSync(join(GENERATED_DIR, 'docs-trust-map.md'), md);
}

function main() {
  mkdirSync(GENERATED_DIR, { recursive: true });
  const generated = [];
  if (serviceMap()) generated.push('service-map.md');
  if (workflowMap()) generated.push('workflow-map.md');
  docsTrustMap();
  generated.push('docs-trust-map.md');
  console.log(`[docs:diagrams] generated ${generated.join(', ')}`);
}

main();
