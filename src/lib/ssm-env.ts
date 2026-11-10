/**
 * Resolves environment variables of the form `ssm:/path/to/parameter` to the
 * value of that SSM parameter, so secrets can live in Parameter Store instead
 * of the Lambda configuration. Does nothing (and makes no AWS call) when no
 * variable uses the prefix, e.g. in local development.
 */

import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';

const PREFIX = 'ssm:';
// GetParameters accepts at most 10 names per call
const BATCH_SIZE = 10;

type Client = Pick<SSMClient, 'send'>;

export async function resolveSsmEnv(
  env: Record<string, string | undefined> = process.env,
  client: Client = new SSMClient({})
): Promise<void> {
  const refs = Object.entries(env).flatMap(([key, value]) =>
    value?.startsWith(PREFIX) ? [{ key, name: value.slice(PREFIX.length) }] : []
  );
  if (refs.length === 0) return;

  const names = [...new Set(refs.map((ref) => ref.name))];
  const batches = Array.from({ length: Math.ceil(names.length / BATCH_SIZE) }, (_, i) =>
    names.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
  );
  const responses = await Promise.all(
    batches.map((Names) => client.send(new GetParametersCommand({ Names, WithDecryption: true })))
  );

  const values = new Map<string, string>();
  for (const { Parameters = [] } of responses) {
    for (const { Name, Value } of Parameters) {
      if (Name !== undefined && Value !== undefined) values.set(Name, Value);
    }
  }

  // Fail startup rather than run with unresolved references
  const missing = refs.filter((ref) => !values.has(ref.name));
  if (missing.length > 0) {
    throw new Error(
      `SSM parameters not found: ${missing.map((ref) => `${ref.key} (${ref.name})`).join(', ')}`
    );
  }

  for (const { key, name } of refs) {
    env[key] = values.get(name);
  }
}
