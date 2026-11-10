/**
 * Starts the mailer Lambda (MAILER_FUNCTION) so queued mail goes out right away.
 * Unset outside Lambda; the scheduled run sends anything missed.
 * @since 2026-11-10
 */

import 'server-only';
import type { LambdaClient } from '@aws-sdk/client-lambda';

let lambda: LambdaClient | undefined;

/**
 * Asynchronously invokes the mailer function, if configured. Never throws.
 */
export async function startMailer(): Promise<void> {
  const functionName = process.env.MAILER_FUNCTION;
  if (!functionName) {
    return;
  }
  try {
    // Loaded only when configured (Lambda), not in local development or tests
    const { InvokeCommand, LambdaClient } = await import('@aws-sdk/client-lambda');
    lambda ??= new LambdaClient({});
    await lambda.send(new InvokeCommand({ FunctionName: functionName, InvocationType: 'Event' }));
  } catch (e) {
    console.error('Could not start mailer:', e);
  }
}
