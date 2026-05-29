#!/usr/bin/env node
import { summarizeResults, validateBrief } from './brief-contract.js';

function parseArgs(argv) {
  const args = { command: argv[2], briefDir: '', strict: false, json: false, briefKeys: [] };
  for (let i = 3; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--strict') args.strict = true;
    else if (value === '--json') args.json = true;
    else if (value === '--brief-key') {
      args.briefKeys.push(argv[i + 1] || '');
      i += 1;
    } else if (value.startsWith('--brief-key=')) {
      args.briefKeys.push(value.slice('--brief-key='.length));
    }
    else if (value === '--brief-dir') {
      args.briefDir = argv[i + 1] || '';
      i += 1;
    } else if (value.startsWith('--brief-dir=')) {
      args.briefDir = value.slice('--brief-dir='.length);
    }
  }
  return args;
}

function printUsage() {
  console.log([
    'Usage:',
    '  node src/cli.js validate-briefs --brief-dir <path> [--brief-key <key>] [--strict] [--json]',
    '',
    'Examples:',
    '  node src/cli.js validate-briefs --brief-dir ../video-studio/content-briefs/prime-self',
    '  node src/cli.js validate-briefs --brief-dir ../video-studio/content-briefs/prime-self --strict',
  ].join('\n'));
}

function printTextReport(summary, root) {
  console.log(`Media Room brief readiness: ${summary.ready}/${summary.checked} ready, ${summary.blocked} blocked`);
  for (const result of summary.results) {
    const status = result.status === 'ready' ? 'READY' : 'BLOCKED';
    const file = relativePath(root, result.file);
    console.log(`\n[${status}] ${result.briefKey} (${result.composition})`);
    console.log(`  file: ${file}`);
    console.log(`  words: ${result.scriptWords || 'generated'} | duration: ${result.durationSeconds}s | min: ${result.minimumDurationSeconds || 'n/a'}s`);
    console.log(`  visuals: steps=${result.renderPlan.steps.length}, beats=${result.renderPlan.visualBeats.length}, screenshots=${result.renderPlan.screenshotUrls.length}, chapters=${result.renderPlan.chapters.length}`);
    for (const issue of result.issues) {
      console.log(`  ${issue.severity.toUpperCase()}: ${issue.code} - ${issue.message}`);
    }
  }
}

const args = parseArgs(process.argv);

if (args.command !== 'validate-briefs' || !args.briefDir) {
  printUsage();
  process.exit(args.command ? 1 : 0);
}

const root = process.cwd();
const briefDir = resolvePath(root, args.briefDir);
const summary = await validateBriefDirectory(briefDir, {
  strict: args.strict,
  briefKeys: args.briefKeys.filter(Boolean),
});

if (args.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  printTextReport(summary, root);
}

if (args.strict && summary.blockers.length > 0) {
  process.exit(1);
}

async function validateBriefDirectory(briefDir, options = {}) {
  const briefKeys = options.briefKeys.length
    ? options.briefKeys
    : await loadBriefKeysFromLibrary(briefDir);
  const briefEntries = await Promise.all(briefKeys.map(async (briefKey) => {
    const file = joinPath(briefDir, `${briefKey}.json`);
    return { file, brief: await importJson(file) };
  }));
  return summarizeResults(briefEntries
    .filter(({ brief }) => Boolean(brief.composition))
    .map(({ file, brief }) => validateBrief(brief, { ...options, file })));
}

async function loadBriefKeysFromLibrary(briefDir) {
  const library = await importJson(joinPath(briefDir, 'training-library.json'));
  if (!Array.isArray(library.modules)) {
    throw new Error(`training-library.json in ${briefDir} must contain a modules array`);
  }
  return library.modules
    .map(module => module?.briefKey)
    .filter(briefKey => typeof briefKey === 'string' && briefKey.trim());
}

async function importJson(file) {
  try {
    const module = await import(toFileUrl(file), { with: { type: 'json' } });
    return module.default;
  } catch (error) {
    throw new Error(`Unable to load JSON brief ${file}: ${error.message}`);
  }
}

function resolvePath(root, input) {
  if (isAbsolutePath(input)) return normalizePath(input);
  return joinPath(root, input);
}

function relativePath(root, file) {
  const normalizedRoot = normalizePath(root);
  const normalizedFile = normalizePath(file);
  const prefix = normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`;
  return normalizedFile.startsWith(prefix) ? normalizedFile.slice(prefix.length) : normalizedFile;
}

function joinPath(base, child) {
  return `${normalizePath(base).replace(/\/+$/u, '')}/${normalizePath(child).replace(/^\/+/u, '')}`;
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function isAbsolutePath(value) {
  return /^([A-Za-z]:\/|\/)/u.test(normalizePath(value));
}

function toFileUrl(file) {
  const normalized = normalizePath(file);
  if (/^[A-Za-z]:\//u.test(normalized)) return `file:///${normalized}`;
  if (normalized.startsWith('/')) return `file://${normalized}`;
  return new URL(normalized, `file://${normalizePath(process.cwd()).replace(/\/?$/u, '/')}`).href;
}
