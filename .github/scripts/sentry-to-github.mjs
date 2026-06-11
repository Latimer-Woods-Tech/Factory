#!/usr/bin/env node
// sentry-to-github.mjs — Poll Sentry for new issues, create GitHub issues
// Runs via sentry-to-github.yml every 4h

const ORG_SLUG = 'latwood-tech';
const GH_ORG = 'Latimer-Woods-Tech';
const GH_REPO = 'factory';
const { GH_TOKEN, SENTRY_TOKEN, LOOKBACK_HOURS = '5' } = process.env;

const lookbackMs = parseInt(LOOKBACK_HOURS, 10) * 60 * 60 * 1000;
const since = new Date(Date.now() - lookbackMs).toISOString();

async function sentry(path) {
  let attempt = 0;
  while (attempt < 4) {
    const res = await fetch(`https://sentry.io/api/0${path}`, {
      headers: { Authorization: `Bearer ${SENTRY_TOKEN}` },
    });

    if (res.ok) return res.json();

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 1000 * Math.pow(2, attempt + 1);
      console.warn(`Sentry rate-limited ${path}; retrying in ${waitMs}ms (attempt ${attempt + 1}/4)`);
      await new Promise(r => setTimeout(r, waitMs));
      attempt++;
      continue;
    }

    throw new Error(`Sentry ${path} → ${res.status}`);
  }

  throw new Error(`Sentry ${path} → 429 (exhausted retries)`);
}

async function ghPost(path, data) {
  const res = await fetch(`https://api.github.com${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GH ${path} → ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function ghGet(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GH GET ${path} → ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function ghSearch(query) {
  const res = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=5`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GH search → ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

function titleKey(project, title) {
  return `${project}:${title}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

async function existingOpenSentryTitles() {
  const titles = new Set();
  for (let page = 1; ; page++) {
    const issues = await ghGet(
      `/repos/${GH_ORG}/${GH_REPO}/issues?state=open&labels=source%3Asentry&per_page=100&page=${page}`,
    );
    for (const issue of issues) {
      if (!issue.pull_request) titles.add(issue.title.toLowerCase().replace(/\s+/g, ' ').trim());
    }
    if (issues.length < 100) return titles;
  }
}

const projects = await sentry(`/organizations/${ORG_SLUG}/projects/`);
const openSentryTitles = await existingOpenSentryTitles();
console.log(`Scanning ${projects.length} projects for new issues since ${since}...`);

let created = 0, skipped = 0;

for (const project of projects) {
  const slug = project.slug;
  let issues = [];
  try {
    issues = await sentry(
      `/projects/${ORG_SLUG}/${slug}/issues/?query=firstSeen%3A>${encodeURIComponent(since)}&limit=25`
    );
  } catch (err) {
    console.warn(`Skipping project ${slug}: ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }

  for (const issue of issues) {
    const title = `[Sentry/${slug}] ${issue.title}`;
    const sentryUrl = `https://sentry.io/organizations/${ORG_SLUG}/issues/${issue.id}/`;

    if (openSentryTitles.has(titleKey(slug, issue.title))) { skipped++; continue; }
    const existing = await ghSearch(`repo:${GH_ORG}/${GH_REPO} ${issue.id} in:body label:source:sentry`);
    if (existing.items.length > 0) { skipped++; continue; }

    const body = [
      `**Sentry Issue:** [${issue.shortId}](${sentryUrl})`,
      `**Project:** ${slug}`,
      `**First seen:** ${issue.firstSeen}`,
      `**Occurrences:** ${issue.count}`,
      `**Level:** ${issue.level}`,
      '',
      '### Culprit',
      '`' + (issue.culprit || 'unknown') + '`',
      '',
      '### Metadata',
      '```json',
      JSON.stringify({ sentryId: issue.id, project: slug, firstSeen: issue.firstSeen }, null, 2),
      '```',
    ].join('\n');

    const priority = (issue.level === 'fatal' || issue.level === 'error') ? 'priority:P1' : 'priority:P2';

    await ghPost(`/repos/${GH_ORG}/${GH_REPO}/issues`, {
      title,
      body,
      labels: ['bug', priority, 'source:sentry', 'supervisor:approved-source'],
    });
    openSentryTitles.add(titleKey(slug, issue.title));
    console.log(`✓ Created: ${slug}/${issue.shortId} — ${issue.title.slice(0, 60)}`);
    created++;
    await new Promise(r => setTimeout(r, 500));
  }
}

console.log(`\nDone. Created: ${created}, Skipped (existing): ${skipped}`);
