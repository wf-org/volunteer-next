/**
 * Runs once at server startup, before any request is handled or route module
 * is loaded, so module-level `process.env` reads see the resolved values.
 * https://nextjs.org/docs/app/guides/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { resolveSsmEnv } = await import('@/lib/ssm-env');
    await resolveSsmEnv();
  }
}
