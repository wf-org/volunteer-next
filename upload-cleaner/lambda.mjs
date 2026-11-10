// AWS Lambda entrypoint (handler: lambda.handler), invoked on a schedule by EventBridge.
// Plain .mjs because the Lambda runtime only resolves .js/.mjs/.cjs handlers;
// Node 24 strips types from the imported .ts file.
import { cleanUploads } from './job.ts';

export const handler = async () => {
  await cleanUploads();
};
