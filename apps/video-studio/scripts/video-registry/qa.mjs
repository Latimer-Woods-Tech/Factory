#!/usr/bin/env node
/**
 * qa.mjs — populate the quality dimension automatically.
 *   - brandScan: scans each asset's brief user-facing text for forbidden words
 *     (SYSTEM_CONTEXT brand law: never "AI", no marketing fluff). Always runs.
 *   - verifiedHttp/fileBytes: curl-checks live publicUrls (expect 206). --verify only.
 * Idempotent: writes the registry only if a quality field changed.
 *   node scripts/video-registry/qa.mjs [--verify]
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..', '..'); // repo root (Factory)
const REGISTRY = resolve(__dirname, '..', '..', 'registry', 'video-registry.json');
const doVerify = process.argv.includes('--verify');

// Brand law — the absolute one is "AI"; the rest is the SYSTEM_CONTEXT fluff list.
const FORBIDDEN = /\b(AI|A\.I\.|artificial intelligence|machine learning|LLM|chatbot|game[- ]?changer|unlock|empower(ing)?|leverage|synergy|holistic|seamless|groundbreaking|cutting[- ]edge)\b/i;

const reg = JSON.parse(readFileSync(REGISTRY, 'utf8'));
const briefCache = new Map();
function scanBrief(relPath) {
  if (briefCache.has(relPath)) return briefCache.get(relPath);
  const abs = join(ROOT, relPath);
  let res = { brandScan: null, issues: [] };
  if (existsSync(abs)) {
    try {
      const b = JSON.parse(readFileSync(abs, 'utf8'));
      const text = [b.title, b.description, ...(b.keyPoints || []), ...(b.variants || []).map((v) => v.hook)].filter(Boolean).join(' \n ');
      const m = text.match(FORBIDDEN);
      res = m ? { brandScan: 'fail', issues: [`forbidden term in copy: "${m[0]}"`] } : { brandScan: 'pass', issues: [] };
    } catch { /* leave null */ }
  }
  briefCache.set(relPath, res);
  return res;
}

function curl(url) {
  try {
    const out = execSync(`curl -s -o /dev/null -w "%{http_code} %{size_download}" -r 0-1 --max-time 12 "${url}"`, { encoding: 'utf8' });
    const [code, size] = out.trim().split(/\s+/);
    return { code: Number(code) || 0, bytes: Number(size) || null };
  } catch { return { code: 0, bytes: null }; }
}

let changed = 0, fails = 0;
for (const a of reg.assets) {
  const before = JSON.stringify(a.quality);
  if (a.source?.brief) {
    const { brandScan, issues } = scanBrief(a.source.brief);
    if (brandScan) {
      a.quality.brandScan = brandScan;
      a.quality.issues = [...(a.quality.issues || []).filter((i) => !i.startsWith('forbidden term')), ...issues];
      if (brandScan === 'fail') fails++;
    }
  }
  if (doVerify && a.build.status === 'live' && a.destination?.publicUrl) {
    const { code, bytes } = curl(a.destination.publicUrl);
    a.quality.verifiedHttp = code;
    if (bytes != null) a.quality.fileBytes = bytes;
    if (code !== 206 && code !== 200) a.quality.issues = [...new Set([...(a.quality.issues || []), `unreachable: HTTP ${code}`])];
  }
  if (JSON.stringify(a.quality) !== before) { a.meta.updatedAt = new Date().toISOString(); changed++; }
}

if (changed) writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
const scanned = reg.assets.filter((a) => a.quality.brandScan).length;
console.log(`✓ qa: brand-scanned ${scanned} assets (${fails} fail) · ${doVerify ? 'curl-verified live URLs · ' : ''}${changed} records updated`);
if (fails) console.log('  ⚠ brand-law failures — run report.mjs for the list');
