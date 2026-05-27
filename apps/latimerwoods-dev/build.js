// Developer dashboard generator for dev.latimerwoods.dev.
// Reads docs/service-registry.yml and renders a static HTML index of the
// Factory ecosystem grouped by surface zone. No client-side JS, no CORS
// probes — registry status fields are the source of truth.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..');
const REGISTRY_PATH = join(ROOT_DIR, 'docs', 'service-registry.yml');
const DIST_DIR = join(__dirname, 'dist');

const ZONES = [
  {
    id: 'products',
    name: 'Customer Products',
    accent: '#10b981',
    description: 'Branded customer-facing products. Live revenue surfaces.',
    matchers: [/selfprime\.net/, /capricast\.com/, /cypherofhealing\.com/, /cipherofhealing\.com/, /xicocity\.com/],
  },
  {
    id: 'operator',
    name: 'Operator Surface',
    accent: '#a855f7',
    description: 'apunlimited.com — the Factory as a product. Admin Studio UI + API.',
    matchers: [/apunlimited\.com/],
  },
  {
    id: 'infra',
    name: 'Production Infrastructure',
    accent: '#3b82f6',
    description: 'latwoodtech.work — machine-to-machine APIs. Always-on internal Workers.',
    matchers: [/latwoodtech\.work/],
  },
  {
    id: 'dev',
    name: 'Developer Surface',
    accent: '#f59e0b',
    description: 'latimerwoods.dev — staging environments, dev tools, PR previews.',
    matchers: [/latimerwoods\.dev/],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    accent: '#ec4899',
    description: 'latwoodtech.com — company homepage.',
    matchers: [/latwoodtech\.com(?!\b\/work)/],
  },
  {
    id: 'workers-dev',
    name: 'Unhomed (workers.dev)',
    accent: '#64748b',
    description: 'Services still on the workers.dev fallback. Should be assigned a custom domain.',
    matchers: [/workers\.dev/],
  },
];

function classifyEntry(entry) {
  const url = entry.url || entry.workers_dev_url || '';
  for (const zone of ZONES) {
    if (zone.matchers.some((re) => re.test(url))) return zone.id;
  }
  return 'workers-dev';
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusBadge(entry) {
  const status = entry.deployment_status || entry.custom_domain_status || 'unknown';
  let tone = 'neutral';
  if (/live|verified|deployed|attached/i.test(status)) tone = 'good';
  else if (/pending|planned|in.progress/i.test(status)) tone = 'warning';
  else if (/retired|broken|fail/i.test(status)) tone = 'bad';
  return `<span class="badge badge--${tone}" title="${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

function healthLink(entry) {
  const base = entry.url || entry.workers_dev_url;
  const endpoint = entry.health_endpoint;
  if (!base || !endpoint) return '';
  const url = `${base.replace(/\/$/, '')}${endpoint}`;
  return `<a class="health-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(endpoint)}</a>`;
}

function renderEntry(entry, kind) {
  const url = entry.url || entry.workers_dev_url || '';
  const urlDisplay = url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>` : '<span class="muted">—</span>';
  return `
    <tr>
      <td class="cell-name">
        <strong>${escapeHtml(entry.id || entry.name)}</strong>
        <span class="muted cell-kind">${escapeHtml(kind)}</span>
      </td>
      <td class="cell-url">${urlDisplay}</td>
      <td class="cell-status">${statusBadge(entry)}</td>
      <td class="cell-health">${healthLink(entry)}</td>
      <td class="cell-repo">${escapeHtml((entry.repo || '').replace('Latimer-Woods-Tech/', ''))}</td>
    </tr>`;
}

function renderZone(zone, entries) {
  if (entries.length === 0) return '';
  const rows = entries
    .map(({ entry, kind }) => renderEntry(entry, kind))
    .join('\n');
  return `
    <section class="zone" id="zone-${zone.id}" style="--zone-accent: ${zone.accent};">
      <header class="zone-header">
        <h2>${escapeHtml(zone.name)}</h2>
        <p class="zone-description">${escapeHtml(zone.description)}</p>
        <span class="zone-count">${entries.length} service${entries.length === 1 ? '' : 's'}</span>
      </header>
      <div class="zone-table-wrap">
        <table class="zone-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>URL</th>
              <th>Status</th>
              <th>Health</th>
              <th>Repo</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </section>`;
}

function renderHtml({ generatedAt, zoneSections, totals }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Latimer Woods Tech — Developer Index</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="hero">
    <div class="hero-inner">
      <h1>Latimer Woods Tech — Developer Index</h1>
      <p class="hero-subtitle">Live map of every Factory service, grouped by surface zone. Generated from <code>docs/service-registry.yml</code>.</p>
      <div class="hero-stats">
        <div><strong>${totals.workers}</strong><span>Workers</span></div>
        <div><strong>${totals.pages}</strong><span>Pages</span></div>
        <div><strong>${totals.packages}</strong><span>Packages</span></div>
      </div>
      <nav class="zone-nav">
        ${ZONES.map((z) => `<a href="#zone-${z.id}" style="--zone-accent: ${z.accent};">${escapeHtml(z.name)}</a>`).join('')}
      </nav>
    </div>
  </header>

  <main>
    ${zoneSections}
  </main>

  <footer>
    <p>Generated <time>${escapeHtml(generatedAt)}</time> from <a href="https://github.com/Latimer-Woods-Tech/factory/blob/main/docs/service-registry.yml" target="_blank" rel="noopener">service-registry.yml</a>.</p>
    <p class="muted">This is an internal developer index. No customer data. Status reflects the registry's last committed state, not a live health probe.</p>
  </footer>
</body>
</html>
`;
}

const STYLES = `
:root {
  color-scheme: dark;
  --bg: #0b1020;
  --bg-elev: #131a30;
  --border: #1f2a47;
  --text: #e2e8f0;
  --text-muted: #94a3b8;
  --link: #60a5fa;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: linear-gradient(180deg, #0b1020 0%, #0a0d1c 100%);
  color: var(--text);
  line-height: 1.55;
}

a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }

code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; font-size: 0.9em; background: rgba(255,255,255,0.05); padding: 1px 6px; border-radius: 4px; }

.hero {
  background: radial-gradient(circle at 10% 0%, rgba(96, 165, 250, 0.18), transparent 60%), var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 56px 24px 32px;
}
.hero-inner { max-width: 1200px; margin: 0 auto; }
.hero h1 { font-size: 28px; margin: 0 0 6px; letter-spacing: -0.01em; }
.hero-subtitle { color: var(--text-muted); margin: 0 0 28px; max-width: 720px; }
.hero-stats { display: flex; gap: 32px; margin-bottom: 28px; }
.hero-stats > div { display: flex; flex-direction: column; }
.hero-stats strong { font-size: 28px; font-weight: 700; }
.hero-stats span { font-size: 13px; color: var(--text-muted); }

.zone-nav { display: flex; flex-wrap: wrap; gap: 8px; }
.zone-nav a {
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--zone-accent, var(--border));
  color: var(--zone-accent, var(--text));
}
.zone-nav a:hover { background: rgba(255,255,255,0.08); text-decoration: none; }

main { max-width: 1200px; margin: 0 auto; padding: 32px 24px 72px; }

.zone {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-left: 3px solid var(--zone-accent, var(--border));
  border-radius: 10px;
  padding: 24px 24px 8px;
  margin-bottom: 28px;
  scroll-margin-top: 24px;
}
.zone-header { display: grid; grid-template-columns: 1fr auto; gap: 8px 16px; margin-bottom: 16px; }
.zone-header h2 { font-size: 20px; margin: 0; color: var(--zone-accent, var(--text)); grid-column: 1; }
.zone-description { color: var(--text-muted); margin: 0; grid-column: 1; font-size: 14px; }
.zone-count { color: var(--text-muted); font-size: 13px; align-self: start; grid-column: 2; grid-row: 1 / span 2; }

.zone-table-wrap { overflow-x: auto; }
.zone-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.zone-table th {
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.zone-table td { padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: top; }
.zone-table tbody tr:last-child td { border-bottom: 0; }

.cell-name strong { display: block; }
.cell-kind { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
.cell-url { word-break: break-all; }
.cell-repo { font-size: 13px; color: var(--text-muted); }

.muted { color: var(--text-muted); }

.badge {
  display: inline-block;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge--good    { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
.badge--warning { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
.badge--bad     { background: rgba(239, 68, 68, 0.15);  color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
.badge--neutral { background: rgba(148, 163, 184, 0.12); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.25); }

.health-link {
  font-family: ui-monospace, monospace;
  font-size: 13px;
  padding: 2px 6px;
  background: rgba(96, 165, 250, 0.1);
  border-radius: 4px;
}

footer {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 13px;
}
footer p { margin: 4px 0; }

@media (max-width: 700px) {
  .hero { padding: 32px 16px 24px; }
  .hero-stats { gap: 20px; }
  main { padding: 24px 16px 48px; }
  .zone { padding: 20px 16px 4px; }
  .zone-header { grid-template-columns: 1fr; }
  .zone-count { grid-column: 1; grid-row: auto; }
}
`;

async function main() {
  const registryText = await readFile(REGISTRY_PATH, 'utf8');
  const registry = yaml.load(registryText);

  const workersList = Array.isArray(registry.workers) ? registry.workers : [];
  const pagesList = Array.isArray(registry.pages) ? registry.pages : [];
  const packagesList = Array.isArray(registry.packages) ? registry.packages : [];

  const grouped = new Map(ZONES.map((z) => [z.id, []]));
  for (const w of workersList) {
    grouped.get(classifyEntry(w)).push({ entry: w, kind: 'Worker' });
  }
  for (const p of pagesList) {
    const entry = { ...p, id: p.id, url: p.custom_domain ? `https://${p.custom_domain}` : (p.staging_url || ''), health_endpoint: null };
    grouped.get(classifyEntry(entry)).push({ entry, kind: 'Pages' });
  }

  const zoneSections = ZONES
    .map((z) => renderZone(z, grouped.get(z.id)))
    .filter(Boolean)
    .join('\n');

  const totals = {
    workers: workersList.length,
    pages: pagesList.length,
    packages: packagesList.length,
  };

  const html = renderHtml({
    generatedAt: new Date().toISOString().slice(0, 19) + 'Z',
    zoneSections,
    totals,
  });

  await mkdir(DIST_DIR, { recursive: true });
  await writeFile(join(DIST_DIR, 'index.html'), html, 'utf8');
  await writeFile(join(DIST_DIR, 'styles.css'), STYLES.trimStart(), 'utf8');

  console.log(`Built dev.latimerwoods.dev → ${DIST_DIR}`);
  console.log(`  Workers: ${totals.workers}`);
  console.log(`  Pages:   ${totals.pages}`);
  console.log(`  Zones rendered: ${ZONES.filter((z) => grouped.get(z.id).length > 0).length}`);
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
