#!/usr/bin/env node
/**
 * check-telemetry-contract.mjs
 *
 * ADM-7: Enforce telemetry contract coverage across Factory apps.
 *
 * For every worker in docs/service-registry.yml that has
 * `telemetry_required: true`, this script verifies that the entry
 * explicitly lists all three canonical telemetry endpoints under
 * `critical_endpoints`:
 *
 *   /api/admin/health
 *   /api/admin/metrics
 *   /api/admin/events
 *
 * Runs in CI on every push/PR. Exit code 1 on any violation.
 *
 * Usage: node scripts/check-telemetry-contract.mjs
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const REQUIRED_TELEMETRY_PATHS = [
  '/api/admin/health',
  '/api/admin/metrics',
  '/api/admin/events',
];

const REGISTRY_FILE = 'docs/service-registry.yml';

function readRegistry() {
  return readFileSync(path.resolve(REGISTRY_FILE), 'utf8');
}

/**
 * Minimal line-by-line YAML parser for the service-registry block format.
 *
 * Splits the `workers:` section into per-worker chunks by looking for
 * `- id:` list markers. Within each chunk, extracts:
 *   - id         (string)
 *   - telemetry_required  (boolean, default false when absent)
 *   - critical_endpoints  (string[], may be empty)
 *
 * NOTE: Only handles the specific indentation and quoting style used in
 * docs/service-registry.yml. Do not use for arbitrary YAML.
 */
function parseWorkers(raw) {
  // Isolate the workers: section
  const workersStart = raw.indexOf('\nworkers:');
  if (workersStart === -1) {
    throw new Error(`${REGISTRY_FILE}: could not find 'workers:' section`);
  }

  // Find the next top-level section after workers:
  const afterWorkers = raw.slice(workersStart + 1);
  const nextTopLevel = afterWorkers.search(/\n[a-zA-Z]/);
  const workersSection =
    nextTopLevel === -1 ? afterWorkers : afterWorkers.slice(0, nextTopLevel);

  // Split into individual worker blocks on "  - id:" lines
  const workerBlocks = workersSection.split(/\n  - id:/g).slice(1);

  const workers = [];

  for (const block of workerBlocks) {
    const lines = block.split('\n');

    // The first line is the id value (after the split on "  - id:")
    const idLine = lines[0] ?? '';
    const id = idLine.replace(/#.*$/, '').trim();

    // Parse telemetry_required (tri-state: true | false | null for missing)
    let telemetryRequired = null;
    for (const line of lines) {
      const m = line.match(/^\s+telemetry_required:\s*(true|false)\b/);
      if (m) {
        telemetryRequired = m[1] === 'true';
        break;
      }
    }

    // Parse critical_endpoints list items ("      - /api/...")
    const criticalEndpoints = [];
    let inCritical = false;
    for (const line of lines) {
      if (/^\s+critical_endpoints:/.test(line)) {
        inCritical = true;
        continue;
      }
      if (inCritical) {
        const epMatch = line.match(/^\s+-\s+(\S+)/);
        if (epMatch) {
          criticalEndpoints.push(epMatch[1]);
        } else if (/^\s+\w/.test(line) && !/^\s+-/.test(line)) {
          // Next key at same indentation level — stop collecting
          inCritical = false;
        }
      }
    }

    workers.push({ id, telemetryRequired, criticalEndpoints });
  }

  return workers;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const raw = readRegistry();
const workers = parseWorkers(raw);
const violations = [];

for (const worker of workers) {
  // Workers missing the field entirely are flagged — every entry must declare intent.
  if (worker.telemetryRequired === null) {
    violations.push(
      `${REGISTRY_FILE}: worker '${worker.id}' is missing the 'telemetry_required' field. ` +
        `Add 'telemetry_required: true' for Factory SaaS apps or 'telemetry_required: false' ` +
        `for infrastructure workers.`,
    );
    continue;
  }

  if (!worker.telemetryRequired) continue;

  for (const required of REQUIRED_TELEMETRY_PATHS) {
    if (!worker.criticalEndpoints.includes(required)) {
      violations.push(
        `${REGISTRY_FILE}: worker '${worker.id}' has telemetry_required: true ` +
          `but is missing '${required}' from critical_endpoints`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error('Telemetry contract conformance check failed.');
  console.error(
    `Every worker with 'telemetry_required: true' must list all three endpoints ` +
      `in 'critical_endpoints': ${REQUIRED_TELEMETRY_PATHS.join(', ')}`,
  );
  console.error('');
  for (const v of violations) {
    console.error(`  ✗ ${v}`);
  }
  process.exit(1);
}

// Report which apps are required to expose telemetry
const required = workers.filter((w) => w.telemetryRequired === true);
const exempt = workers.filter((w) => w.telemetryRequired === false);

console.log('Telemetry contract conformance check passed.');
console.log(
  `  ${required.length} app(s) require telemetry: ${required.map((w) => w.id).join(', ') || '(none)'}`,
);
console.log(
  `  ${exempt.length} worker(s) exempt from telemetry: ${exempt.map((w) => w.id).join(', ') || '(none)'}`,
);
