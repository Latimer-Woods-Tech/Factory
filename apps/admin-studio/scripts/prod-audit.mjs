/**
 * Hard gate on PRODUCTION supply-chain CVEs for the admin-studio Worker.
 *
 * Fails (exit 1) on any high/critical advisory in a dependency that actually
 * ships in the deployed Worker bundle (hono, drizzle-orm, stripe, the neon
 * driver, etc.).
 *
 * Tolerates dev-only tooling (vitest / vite / @vitest/*) that leaks into the
 * audited tree via `file:`-linked workspace packages' devDependencies. That
 * tooling is never bundled into the Worker, so it carries no production
 * supply-chain risk; clearing it would require a monorepo-wide vitest 3→4
 * major migration tracked separately. Those advisories are reported as a
 * notice, not a failure.
 *
 * Usage (from apps/admin-studio): `node scripts/prod-audit.mjs`
 */
import { execSync } from 'node:child_process';

/** Packages that are build/test tooling only — never in the deployed bundle. */
const DEV_ONLY = /^(vitest|vite|vite-node)$|^@vitest\//;

let raw = '';
try {
  raw = execSync('npm audit --omit=dev --json', { encoding: 'utf8' });
} catch (err) {
  // npm audit exits non-zero when vulnerabilities exist; its JSON is still on stdout.
  raw = err.stdout || '';
}

if (!raw) {
  console.error('prod-audit: no audit output (npm audit failed to run)');
  process.exit(1);
}

const audit = JSON.parse(raw);
const offenders = [];
const tolerated = [];

for (const [name, v] of Object.entries(audit.vulnerabilities || {})) {
  if (!['high', 'critical'].includes(v.severity)) continue;
  (DEV_ONLY.test(name) ? tolerated : offenders).push(`${v.severity.toUpperCase()} ${name} (${v.range})`);
}

if (tolerated.length) {
  console.log(`::notice::prod-audit tolerated dev-only tooling CVEs (not bundled): ${tolerated.join(', ')}`);
}

if (offenders.length) {
  console.error('::error::Production supply-chain CVE gate FAILED — patch these before deploy:');
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}

console.log('✓ Production supply chain clean (no high/critical CVEs in bundled dependencies).');
