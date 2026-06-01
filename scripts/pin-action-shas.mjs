#!/usr/bin/env node
// One-shot helper to SHA-pin third-party actions across workflow files.
// Pass workflow paths as args; each `uses: <action>@<major>` line is rewritten
// to `uses: <action>@<sha> # <full-version>` per the PIN_MAP below.
//
// Dependabot's github-actions ecosystem watches both the SHA AND the trailing
// `# <version>` comment and bumps them together when a new release ships.

import fs from 'node:fs';
import path from 'node:path';

const PIN_MAP = {
  'actions/checkout': {
    'v4': { sha: '34e114876b0b11c390a56381ad16ebd13914f8d5', version: 'v4.3.1' },
    'v5': { sha: '93cb6efe18208431cddfb8368fd83d5badbf9bfd', version: 'v5.0.1' },
    'v6': { sha: 'de0fac2e4500dabe0009e67214ff5f5447ce83dd', version: 'v6.0.2' },
  },
  'actions/setup-node': {
    'v6': { sha: '48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e', version: 'v6.4.0' },
  },
  'actions/create-github-app-token': {
    'v3': { sha: 'bcd2ba49218906704ab6c1aa796996da409d3eb1', version: 'v3.2.0' },
  },
  'actions/dependency-review-action': {
    'v4': { sha: '2031cfc080254a8a887f58cffee85186f0e49e48', version: 'v4.9.0' },
  },
  'actions/upload-artifact': {
    'v7': { sha: '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', version: 'v7.0.1' },
  },
  'cloudflare/wrangler-action': {
    'v3': { sha: '9acf94ace14e7dc412b076f2c5c20b8ce93c79cd', version: 'v3.15.0' },
  },
  'google-github-actions/auth': {
    'v2': { sha: 'c200f3691d83b41bf9bbd8638997a462592937ed', version: 'v2.1.13' },
    'v3': { sha: '7c6bc770dae815cd3e89ee6cdf493a5fab2cc093', version: 'v3.0.0' },
  },
  'google-github-actions/setup-gcloud': {
    'v2': { sha: 'e427ad8a34f8676edf47cf7d7925499adf3eb74f', version: 'v2.2.1' },
    'v3': { sha: 'aa5489c8933f4cc7a4f7d45035b3b1440c9c10db', version: 'v3.0.1' },
  },
  'github/codeql-action/init': {
    'v4': { sha: '7211b7c8077ea37d8641b6271f6a365a22a5fbfa', version: 'v4.36.0' },
  },
  'github/codeql-action/analyze': {
    'v4': { sha: '7211b7c8077ea37d8641b6271f6a365a22a5fbfa', version: 'v4.36.0' },
  },
};

// Build regex for "uses: <action>@<major>" — must match end-of-token so we
// don't replace `@v4` inside an already-pinned `@v4.3.1` or `@<sha>`.
function pinFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  let changes = 0;
  for (const [action, majors] of Object.entries(PIN_MAP)) {
    for (const [major, { sha, version }] of Object.entries(majors)) {
      // Match: `uses: <action>@<major>` where <major> is end of value (followed
      // by EOL, whitespace, or `#`). Capture leading whitespace + `uses:` so we
      // can keep formatting.
      const escAction = action.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
      const re = new RegExp(
        `(^[ \\t]*-?[ \\t]*uses:[ \\t]+)${escAction}@${major}(?=\\s|$|#)`,
        'gm'
      );
      const replaced = src.replace(re, (_m, lead) => {
        changes++;
        return `${lead}${action}@${sha} # ${version}`;
      });
      src = replaced;
    }
  }
  if (changes > 0) {
    fs.writeFileSync(file, src);
  }
  return changes;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: pin-action-shas.mjs <workflow.yml> [workflow.yml ...]');
  process.exit(1);
}

let total = 0;
for (const f of files) {
  const abs = path.resolve(f);
  if (!fs.existsSync(abs)) {
    console.error(`skip (not found): ${f}`);
    continue;
  }
  const n = pinFile(abs);
  if (n > 0) console.log(`${f}: pinned ${n} action ref(s)`);
  total += n;
}
console.log(`\nTotal: ${total} replacements across ${files.length} file(s).`);
