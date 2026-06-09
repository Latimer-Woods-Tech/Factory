#!/usr/bin/env node
/**
 * Migration runner for the factory-network Neon project (NETWORK_DB).
 *
 * Reads migrations from the migrations/ directory and applies pending ones
 * in order, tracked by a schema_migrations table. Connection string is taken
 * from the FACTORY_NETWORK_CONNECTION_STRING environment variable (set by the
 * deploy workflow from GCP Secret Manager).
 *
 * Follows the same pattern as selfprime workers/src/db/migrate.js.
 */
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'migrations');

const connectionString = process.env.FACTORY_NETWORK_CONNECTION_STRING;
if (!connectionString) {
  console.error('FACTORY_NETWORK_CONNECTION_STRING is not set');
  process.exit(1);
}

const sql = postgres(connectionString, { ssl: 'require', max: 1 });

async function main() {
  // Ensure the ledger table exists.
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name TEXT PRIMARY KEY,
      checksum       TEXT NOT NULL,
      applied_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // Read applied migrations.
  const applied = new Set(
    (await sql`SELECT migration_name FROM schema_migrations`).map(r => r.migration_name),
  );

  // Read all migration files, sorted ascending.
  const files = (await readdir(MIGRATIONS_DIR))
    .filter(f => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;

    const content = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const checksum = createHash('sha256').update(content).digest('hex');

    console.log(`Applying ${file}...`);
    // Run migration in a transaction.
    await sql.begin(async tx => {
      await tx.unsafe(content);
      await tx`
        INSERT INTO schema_migrations (migration_name, checksum)
        VALUES (${file}, ${checksum})
      `;
    });
    console.log(`  ✓ ${file}`);
    ran++;
  }

  if (ran === 0) {
    console.log('No pending migrations.');
  } else {
    console.log(`Applied ${ran} migration(s).`);
  }

  await sql.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
