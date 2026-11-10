// Local / docker compose entrypoint.
//   node db/migrator/cli.ts             apply pending scripts
//   node db/migrator/cli.ts --baseline  mark all scripts applied without running them
import path from 'node:path';
import { migrate } from './migrate.ts';

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('POSTGRES_URL is not set. Add it to .env.local or export it.');
  process.exit(1);
}

await migrate({
  connectionString,
  dir: path.join(import.meta.dirname, '..', 'scripts'),
  baseline: process.argv.includes('--baseline')
});
