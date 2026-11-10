// AWS Lambda entrypoint (handler: lambda.handler), invoked by the deploy workflow.
// Plain .mjs because the Lambda runtime only resolves .js/.mjs/.cjs handlers;
// Node 24 strips types from the imported .ts file.
import path from 'node:path';
import { migrate } from './migrate.ts';

export const handler = async () => {
  const applied = await migrate({
    connectionString: process.env.POSTGRES_URL,
    dir: path.join(import.meta.dirname, 'scripts')
  });
  return { applied };
};
