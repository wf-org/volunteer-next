// AWS Lambda entrypoint (handler: lambda.handler), run by EventBridge Scheduler
// and started by web after it queues mail.
// Plain .mjs because the Lambda runtime only resolves .js/.mjs/.cjs handlers;
// Node 24 strips the types from the imported .ts file.
import { RATE_LIMIT, sendQueuedEmails } from './job.ts';

// Stop starting batches when less than this much of the timeout is left.
const MIN_REMAINING_MS = 30_000;

export const handler = async (_event, context) => {
  let total = 0;
  for (;;) {
    const { fetched, sent } = await sendQueuedEmails();
    total += sent;
    // A short batch means the queue is empty. A batch where nothing was sent
    // (SMTP down) would just burn retries, so leave it to the next run.
    if (!RATE_LIMIT || fetched < RATE_LIMIT || sent === 0) {
      break;
    }
    if (context.getRemainingTimeInMillis() < MIN_REMAINING_MS) {
      console.log('Stopping before timeout; the next run continues.');
      break;
    }
  }
  console.log(`Sent ${total} emails.`);
};
