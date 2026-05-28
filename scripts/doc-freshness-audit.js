#!/usr/bin/env node

/**
 * Documentation Freshness Audit Script
 *
 * PURPOSE:
 *   Checks all documentation files in docs/ for staleness.
 *   A doc is "stale" if it hasn't been updated within {cadence_days} of its scheduled update.
 *
 * USAGE:
 *   node scripts/doc-freshness-audit.js
 *
 * OUTPUT:
 *   Markdown report of stale docs, categorized by severity.
 *   Exit code 0 = no stale docs, 1 = stale docs found.
 *
 * INTEGRATION:
 *   - Run weekly via GitHub Actions (Monday 9:00 UTC)
 *   - Output to status check or issue
 *   - Auto-assign stale docs to owners
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = process.env.DOCS_TARGET_ROOT ? path.resolve(process.env.DOCS_TARGET_ROOT) : path.resolve(__dirname, '..');
const CATALOG_DIR = path.join(WORKSPACE_ROOT, 'docs', '_catalog');

/**
 * Cadence definitions (in days since last update)
 */
const CADENCE_DAYS = {
  'monthly': 30,
  'quarterly': 90,
  'semi-annually': 180,
  'annually': 365,
  'on-deployment': 0,
  'as-needed': 365,
  'issue-driven': 60,
};

/**
 * Document registry (from DOCS_OWNERSHIP.md)
 * Format: { filepath, cadence, owner }
 */
const DOC_REGISTRY = [
  // Strategic & Planning Docs
  { path: 'WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md', cadence: 'monthly', owner: 'Product Lead' },
  { path: 'PHASE_6_CHECKLIST.md', cadence: 'quarterly', owner: 'Platform Lead' },
  { path: 'docs/IMPLEMENTATION_MASTER_INDEX.md', cadence: 'monthly', owner: 'Tech Writer / EM' },

  // Quality & Process Docs
  { path: 'docs/runbooks/definition-of-ready-done.md', cadence: 'quarterly', owner: 'EM / Tech Lead' },
  { path: 'docs/runbooks/product-quality-review.md', cadence: 'quarterly', owner: 'Product Lead' },
  { path: 'docs/DOCS_OWNERSHIP.md', cadence: 'semi-annually', owner: 'Tech Writer' },

  // Operational Runbooks
  { path: 'docs/runbooks/getting-started.md', cadence: 'quarterly', owner: 'Platform Lead' },
  { path: 'docs/runbooks/add-new-app.md', cadence: 'quarterly', owner: 'Platform Lead' },
  { path: 'docs/runbooks/database.md', cadence: 'semi-annually', owner: 'Database Admin' },
  { path: 'docs/runbooks/deployment.md', cadence: 'quarterly', owner: 'EM / Ops Lead' },
  { path: 'docs/runbooks/environment-isolation-and-verification.md', cadence: 'annually', owner: 'Platform Lead' },
  { path: 'docs/runbooks/github-secrets-and-tokens.md', cadence: 'quarterly', owner: 'DevOps / Ops Lead' },
  { path: 'docs/runbooks/secret-rotation.md', cadence: 'annually', owner: 'DevOps / Ops Lead' },
  { path: 'docs/runbooks/slo.md', cadence: 'quarterly', owner: 'Ops Lead / SRE' },
  { path: 'docs/runbooks/transfer.md', cadence: 'as-needed', owner: 'Platform Lead' },
  { path: 'docs/runbooks/lessons-learned.md', cadence: 'monthly', owner: 'All engineers' },
  { path: 'docs/runbooks/rfc-process.md', cadence: 'quarterly', owner: 'Platform Lead' },
  { path: 'docs/runbooks/rollback-runbook.md', cadence: 'quarterly', owner: 'Ops Lead' },
  { path: 'docs/runbooks/release-procedure.md', cadence: 'quarterly', owner: 'EM / Ops Lead' },
  { path: 'docs/runbooks/incident-response-playbook.md', cadence: 'quarterly', owner: 'Ops Lead / SRE' },
  { path: 'docs/runbooks/error-budget-policy.md', cadence: 'semi-annually', owner: 'Ops Lead / SRE' },
  { path: 'docs/runbooks/security-review-checklist.md', cadence: 'quarterly', owner: 'DevOps / Ops Lead' },
  { path: 'docs/runbooks/frontend-contribution-guide.md', cadence: 'semi-annually', owner: 'Tech Lead' },
  { path: 'docs/runbooks/design-review-checklist.md', cadence: 'quarterly', owner: 'Design Lead' },

  // Standards & Baselines
  { path: 'docs/packages/design-standards.mdx', cadence: 'semi-annually', owner: 'Design Lead' },
  { path: 'docs/packages/videoking-engineering-baseline.mdx', cadence: 'quarterly', owner: 'Core App Tech Lead' },
  { path: 'docs/packages/journeys.mdx', cadence: 'quarterly', owner: 'Product Lead' },
  { path: 'docs/service-registry.yml', cadence: 'on-deployment', owner: 'Platform Lead' },

  // Reference & Templates
  { path: 'docs/APP_README_TEMPLATE.md', cadence: 'annually', owner: 'Tech Writer' },
  { path: 'docs/ENVIRONMENT_VERIFICATION_SETUP.md', cadence: 'annually', owner: 'Platform Lead' },
  { path: 'docs/README.md', cadence: 'quarterly', owner: 'Tech Writer' },
  { path: 'docs/DOCUMENTATION_HIERARCHY.md', cadence: 'semi-annually', owner: 'Tech Writer' },
  { path: 'docs/IMPLEMENTATION_SCORECARD.md', cadence: 'monthly', owner: 'Tech Writer / EM' },
  { path: 'docs/NAMING_CONVENTIONS.md', cadence: 'semi-annually', owner: 'Platform Lead' },
  { path: 'docs/CI_CD.md', cadence: 'quarterly', owner: 'Platform Lead' },
  { path: 'docs/TEAM_HANDOFF.md', cadence: 'quarterly', owner: 'EM' },
  { path: 'docs/architecture/FACTORY_V1.md', cadence: 'semi-annually', owner: 'Architect' },

  // Foundation (not typically updated)
  { path: 'CLAUDE.md', cadence: 'quarterly', owner: 'Engineer / EM' },
  { path: 'START_HERE.md', cadence: 'annually', owner: 'Tech Writer' },

  // Per-repo standing orders (read by LLM reviewer on every PR)
  // Keep current with each repo's actual stack — semi-annual review minimum.
  { path: '.github/repo-contexts/coh/CLAUDE.md',        cadence: 'semi-annually', owner: 'Engineer / EM' },
  { path: '.github/repo-contexts/humandesign/CLAUDE.md', cadence: 'semi-annually', owner: 'Engineer / EM' },
  { path: '.github/repo-contexts/videoking/CLAUDE.md',  cadence: 'semi-annually', owner: 'Engineer / EM' },
];

/**
 * Extract "Last Updated" date from a file
 * Looks for "Last Updated: YYYY-MM-DD" or "**Last Updated:** YYYY-MM-DD" at top of file
 */
function extractLastUpdatedDate(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').slice(0, 20); // Check first 20 lines
    
    for (const line of lines) {
      const isoMatch = line.match(/\*?\*?Last Updated:\*?\*?\s+(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        const [, year, month, day] = isoMatch;
        return new Date(`${year}-${month}-${day}`);
      }

      const longMatch = line.match(/\*?\*?Last Updated:\*?\*?\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/);
      if (longMatch) {
        const [, monthName, day, year] = longMatch;
        const parsed = new Date(`${monthName} ${day}, ${year}`);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }
  } catch (err) {
    // File doesn't exist or can't be read
    return null;
  }
  return null;
}

/**
 * Calculate days since last update
 */
function daysSinceUpdate(lastUpdateDate) {
  if (!lastUpdateDate) return Infinity;
  const today = new Date();
  const diffMs = today - lastUpdateDate;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Classify staleness severity
 */
function getStalenessSeverity(daysSince, cadenceDays) {
  const threshold = cadenceDays + 30; // Allow 30 days grace period
  
  if (daysSince <= cadenceDays) return 'fresh';
  if (daysSince <= cadenceDays + 30) return 'yellow';
  if (daysSince <= cadenceDays + 90) return 'red';
  return 'critical';
}

/**
 * Run the audit
 */
function runAudit() {
  const results = {
    fresh: [],
    yellow: [], // 31-89 days overdue
    red: [],    // 90-179 days overdue
    critical: [], // 180+ days overdue
    missing: [],
  };

  const workspaceRoot = WORKSPACE_ROOT;

  for (const doc of DOC_REGISTRY) {
    const fullPath = path.join(workspaceRoot, doc.path);
    const lastUpdateDate = extractLastUpdatedDate(fullPath);
    
    if (!lastUpdateDate) {
      results.missing.push(doc);
      continue;
    }

    const cadenceDays = CADENCE_DAYS[doc.cadence] || 365;
    const daysSince = daysSinceUpdate(lastUpdateDate);
    const severity = getStalenessSeverity(daysSince, cadenceDays);

    const entry = {
      ...doc,
      lastUpdateDate: lastUpdateDate.toISOString().split('T')[0],
      daysSince,
      cadenceDays,
    };

    results[severity].push(entry);
  }

  return results;
}

/**
 * Format results as markdown
 */
function formatMarkdown(results) {
  const date = new Date().toISOString().split('T')[0];
  let md = `# Documentation Freshness Audit\n\n`;
  md += `**Generated:** ${date}\n\n`;

  // Fresh docs
  if (results.fresh.length > 0) {
    md += `## ✅ Fresh Documentation (${results.fresh.length})\n\n`;
    for (const doc of results.fresh.slice(0, 5)) {
      md += `- \`${doc.path}\` (updated ${doc.lastUpdateDate}, ${doc.daysSince} days ago)\n`;
    }
    if (results.fresh.length > 5) {
      md += `- ... and ${results.fresh.length - 5} more\n`;
    }
    md += '\n';
  }

  // Yellow flags
  if (results.yellow.length > 0) {
    md += `## ⚠️ Yellow Flags — 31-89 days overdue (${results.yellow.length})\n\n`;
    md += `These docs should be updated soon:\n\n`;
    for (const doc of results.yellow) {
      const daysOverdue = doc.daysSince - doc.cadenceDays;
      md += `- **\`${doc.path}\`** (last updated ${doc.lastUpdateDate}, ${daysOverdue} days overdue)\n`;
      md += `  - Cadence: ${doc.cadence} (${doc.cadenceDays} days)\n`;
      md += `  - Owner: ${doc.owner}\n`;
    }
    md += '\n';
  }

  // Red flags
  if (results.red.length > 0) {
    md += `## 🚨 Red Flags — 90-179 days overdue (${results.red.length})\n\n`;
    md += `These docs are significantly out of date:\n\n`;
    for (const doc of results.red) {
      const daysOverdue = doc.daysSince - doc.cadenceDays;
      md += `- **\`${doc.path}\`** (last updated ${doc.lastUpdateDate}, ${daysOverdue} days overdue)\n`;
      md += `  - Cadence: ${doc.cadence} (${doc.cadenceDays} days)\n`;
      md += `  - Owner: ${doc.owner}\n`;
    }
    md += '\n';
  }

  // Critical
  if (results.critical.length > 0) {
    md += `## 🔥 Critical — 180+ days overdue (${results.critical.length})\n\n`;
    md += `These docs are severely out of date and must be reviewed immediately:\n\n`;
    for (const doc of results.critical) {
      const daysOverdue = doc.daysSince - doc.cadenceDays;
      md += `- **\`${doc.path}\`** (last updated ${doc.lastUpdateDate}, ${daysOverdue} days overdue)\n`;
      md += `  - Cadence: ${doc.cadence} (${doc.cadenceDays} days)\n`;
      md += `  - Owner: ${doc.owner}\n`;
    }
    md += '\n';
  }

  // Missing "Last Updated" date
  if (results.missing.length > 0) {
    md += `## 📋 Missing "Last Updated" Field (${results.missing.length})\n\n`;
    md += `These docs don't have a "Last Updated" date at the top. Add one soon:\n\n`;
    for (const doc of results.missing) {
      md += `- \`${doc.path}\` (owner: ${doc.owner})\n`;
    }
    md += '\n';
  }

  // Summary
  md += `## Summary\n\n`;
  md += `| Category | Count |\n`;
  md += `|----------|-------|\n`;
  md += `| Fresh | ${results.fresh.length} |\n`;
  md += `| Yellow ⚠️ | ${results.yellow.length} |\n`;
  md += `| Red 🚨 | ${results.red.length} |\n`;
  md += `| Critical 🔥 | ${results.critical.length} |\n`;
  md += `| Missing "Last Updated" | ${results.missing.length} |\n`;

  return md;
}

/**
 * Main
 */
const results = runAudit();
const markdown = formatMarkdown(results);
const report = {
  version: 1,
  generated_by: 'scripts/doc-freshness-audit.js',
  generated_at: new Date().toISOString(),
  ok: results.yellow.length === 0 && results.red.length === 0 && results.critical.length === 0 && results.missing.length === 0,
  counts: {
    fresh: results.fresh.length,
    yellow: results.yellow.length,
    red: results.red.length,
    critical: results.critical.length,
    missing: results.missing.length,
  },
  results,
};

fs.mkdirSync(CATALOG_DIR, { recursive: true });
fs.writeFileSync(path.join(CATALOG_DIR, 'freshness.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(CATALOG_DIR, 'freshness.md'), markdown);

console.log(markdown);

// Exit code: 0 if no stale docs, 1 if any stale docs found
const hasStale = results.yellow.length > 0 || results.red.length > 0 || results.critical.length > 0 || results.missing.length > 0;
process.exit(hasStale ? 1 : 0);
