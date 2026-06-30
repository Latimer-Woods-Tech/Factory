/**
 * patch.mjs — shared registry write helpers for pipeline write-back.
 * Best-effort: a missing registry is a no-op (rendering must never fail on tracking).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REG = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'registry', 'video-registry.json');

/** Apply patchFn to every asset whose id OR briefKey matches. Returns count patched. */
export function patchAssets(match, patchFn) {
  try {
    if (!existsSync(REG)) return 0;
    const r = JSON.parse(readFileSync(REG, 'utf8'));
    let n = 0;
    for (const a of r.assets) {
      if (a.id === match || a.briefKey === match) { patchFn(a); a.meta.updatedAt = new Date().toISOString(); n++; }
    }
    if (n) writeFileSync(REG, JSON.stringify(r, null, 2) + '\n');
    return n;
  } catch (e) { console.warn('[registry] patch skipped:', e.message); return 0; }
}
