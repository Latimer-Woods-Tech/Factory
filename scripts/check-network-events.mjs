#!/usr/bin/env node
/**
 * check-network-events.mjs — Platform Standard §12 schema enforcement.
 *
 * Scans all app source files for fireNetworkEvent() calls and validates
 * that the event_name matches a declared entry in docs/registry/network-events.yml.
 * Fails CI if any event_name is not in the registry.
 *
 * Usage: node scripts/check-network-events.mjs [--app <app-id>]
 * Runs in generate-founder-stats.yml after each hourly scan.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';

const execFileP = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = join(ROOT, 'docs', 'registry', 'network-events.yml');

async function main() {
  const args = process.argv.slice(2);
  const appFilter = args[args.indexOf('--app') + 1] ?? null;

  if (!existsSync(REGISTRY)) {
    console.log('check-network-events: registry not found — skip');
    return;
  }

  const registryDoc = yaml.load(await readFile(REGISTRY, 'utf8'));
  const declaredEvents = new Set(
    (registryDoc?.events ?? []).map((e) => e.name),
  );

  // Grep for fireNetworkEvent() calls across the codebase.
  let grepArgs = [
    '--include=*.ts', '--include=*.js', '--include=*.mjs',
    '-rn', 'fireNetworkEvent',
    'apps/', 'HumanDesign/', 'capricast/',
  ];
  if (appFilter) {
    // Narrow to a specific app directory
    grepArgs = [
      '--include=*.ts', '--include=*.js', '--include=*.mjs',
      '-rn', 'fireNetworkEvent',
      appFilter,
    ];
  }

  let grepOutput = '';
  try {
    const { stdout } = await execFileP('grep', grepArgs, { cwd: ROOT });
    grepOutput = stdout;
  } catch (err) {
    // grep exits 1 when no matches — that's fine if no events are fired yet
    if (err.code === 1) {
      console.log('check-network-events: no fireNetworkEvent() calls found — no violations');
      return;
    }
    throw err;
  }

  const violations = [];
  for (const line of grepOutput.trim().split('\n')) {
    if (!line.trim()) continue;
    // Extract event_name from fireNetworkEvent(ctx, env, 'event.name', ...)
    const match = line.match(/fireNetworkEvent\([^,]+,[^,]+,\s*['"]([^'"]+)['"]/);
    if (!match) continue;
    const eventName = match[1];
    if (!declaredEvents.has(eventName)) {
      violations.push({ line, eventName });
    }
  }

  if (violations.length === 0) {
    console.log(`check-network-events: all fireNetworkEvent() calls reference declared events (${declaredEvents.size} in registry) ✓`);
    return;
  }

  console.error('check-network-events: UNDECLARED event names detected!\n');
  for (const v of violations) {
    console.error(`  ✗ "${v.eventName}" — not in docs/registry/network-events.yml`);
    console.error(`    ${v.line.trim()}`);
  }
  console.error('\nAdd the event(s) to docs/registry/network-events.yml before merging.');
  process.exit(1);
}

main().catch((err) => {
  console.error('check-network-events failed:', err);
  process.exit(1);
});
