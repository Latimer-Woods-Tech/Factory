#!/usr/bin/env node
/**
 * Email Domain Migration Script
 *
 * Migrates email addresses from @thefactory.dev to @latwoodtech.com
 * across the Factory codebase.
 *
 * Usage:
 *   node scripts/migrate-email-domain.mjs [--dry-run]
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const DRY_RUN = process.argv.includes('--dry-run');

const FILES_TO_UPDATE = [
  {
    path: 'apps/admin-studio/src/digest/send.ts',
    replacements: [
      {
        from: 'digest@thefactory.dev',
        to: 'digest@latwoodtech.com',
        description: 'Factory Digest sender address'
      }
    ]
  },
  {
    path: 'packages/email/src/index.ts',
    replacements: [
      {
        from: 'noreply@thefactory.dev',
        to: 'noreply@latwoodtech.com',
        description: 'Default no-reply sender address'
      }
    ]
  }
];

console.log('🔧 Email Domain Migration Script');
console.log('================================');
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will modify files)'}\n`);

let totalReplacements = 0;
let filesModified = 0;

for (const file of FILES_TO_UPDATE) {
  const filePath = resolve(process.cwd(), file.path);

  try {
    let content = readFileSync(filePath, 'utf-8');
    let modified = false;
    let fileReplacements = 0;

    console.log(`\n📄 Processing: ${file.path}`);

    for (const replacement of file.replacements) {
      if (content.includes(replacement.from)) {
        console.log(`  ✅ Found: "${replacement.from}"`);
        console.log(`     → Replacing with: "${replacement.to}"`);
        console.log(`     → Context: ${replacement.description}`);

        const before = content;
        content = content.replaceAll(replacement.from, replacement.to);

        if (before !== content) {
          modified = true;
          fileReplacements++;
          totalReplacements++;
        }
      } else {
        console.log(`  ℹ️  Not found: "${replacement.from}" (may already be updated)`);
      }
    }

    if (modified && !DRY_RUN) {
      writeFileSync(filePath, content, 'utf-8');
      filesModified++;
      console.log(`  💾 File updated (${fileReplacements} replacement${fileReplacements !== 1 ? 's' : ''})`);
    } else if (modified && DRY_RUN) {
      console.log(`  🔍 Would update file (${fileReplacements} replacement${fileReplacements !== 1 ? 's' : ''})`);
    } else {
      console.log(`  ⏭️  No changes needed`);
    }

  } catch (error) {
    console.error(`  ❌ Error processing file: ${error.message}`);
  }
}

console.log('\n================================');
console.log('📊 Summary:');
console.log(`   Total replacements: ${totalReplacements}`);
console.log(`   Files modified: ${DRY_RUN ? 0 : filesModified}`);

if (DRY_RUN) {
  console.log('\n⚠️  DRY RUN MODE - No files were changed');
  console.log('   Run without --dry-run to apply changes');
} else if (totalReplacements > 0) {
  console.log('\n✅ Migration complete!');
  console.log('   Next steps:');
  console.log('   1. Review changes: git diff');
  console.log('   2. Test locally: npm run dev');
  console.log('   3. Run tests: npm test');
  console.log('   4. Commit: git add -A && git commit -m "fix(email): migrate from @thefactory.dev to @latwoodtech.com"');
  console.log('   5. Deploy to staging');
  console.log('   6. Verify emails send correctly');
} else {
  console.log('\n✅ All email addresses already up to date!');
}

console.log('');
