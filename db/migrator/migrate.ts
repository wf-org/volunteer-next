// Applies db/scripts/*.sql in filename order, each once, in its own transaction.
// Replaces Liquibase (`<includeAll path="scripts"/>`); on first run it imports
// Liquibase's databasechangelog so already-applied scripts are not re-run.
import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Arbitrary constant; every migrator run takes this session-level advisory lock,
// so concurrent runs queue instead of racing.
const LOCK_ID = 727_001;

export type MigrateOptions = {
  // Direct (not pooled) connection: advisory locks are per session.
  connectionString: string;
  dir: string;
  // Record scripts as applied without running them (old `neon:sync` / changelogSync).
  baseline?: boolean;
  log?: (message: string) => void;
};

export async function migrate({ connectionString, dir, baseline = false, log = console.log }: MigrateOptions) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   text PRIMARY KEY,
        checksum   text,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    await importLiquibaseHistory(client, log);

    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const { rows } = await client.query<{ filename: string; checksum: string | null }>(
      'SELECT filename, checksum FROM schema_migrations'
    );
    const applied = new Map(rows.map((r) => [r.filename, r.checksum]));

    const ran: string[] = [];
    for (const file of files) {
      const sql = await readFile(path.join(dir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');

      if (applied.has(file)) {
        const previous = applied.get(file);
        if (previous === null) {
          // Imported from Liquibase without a comparable checksum; pin the current one.
          await client.query('UPDATE schema_migrations SET checksum = $2 WHERE filename = $1', [file, checksum]);
        } else if (previous !== checksum) {
          throw new Error(`${file} was modified after it was applied; add a new script instead`);
        }
        continue;
      }

      log(`${baseline ? 'baseline' : 'apply'} ${file}`);
      await client.query('BEGIN');
      try {
        // Whole file as one simple-protocol query: multi-statement, keeps $$ bodies intact.
        if (!baseline) await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`${file}: ${(error as Error).message}`, { cause: error });
      }
      ran.push(file);
    }

    log(ran.length ? `${ran.length} script(s) ${baseline ? 'baselined' : 'applied'}` : 'up to date');
    return ran;
  } finally {
    // Ending the session releases the advisory lock.
    await client.end();
  }
}

async function importLiquibaseHistory(client: Client, log: (message: string) => void) {
  const { rows: [{ empty }] } = await client.query('SELECT NOT EXISTS (SELECT 1 FROM schema_migrations) AS empty');
  const { rows: [{ present }] } = await client.query(
    "SELECT to_regclass('public.databasechangelog') IS NOT NULL AS present"
  );
  if (!empty || !present) return;

  // Liquibase stores e.g. "scripts/v001_create_table.sql"; keep the basename.
  const { rowCount } = await client.query(`
    INSERT INTO schema_migrations (filename, applied_at)
    SELECT DISTINCT ON (name) name, dateexecuted
    FROM (SELECT regexp_replace(filename, '^.*/', '') AS name, dateexecuted FROM databasechangelog) s
    ORDER BY name, dateexecuted
    ON CONFLICT DO NOTHING`);
  log(`imported ${rowCount} script(s) from Liquibase databasechangelog`);
}
