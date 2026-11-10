import cron from 'node-cron';
import { RATE_LIMIT, sendQueuedEmails } from './job.ts';

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 * * * *';

console.log(
  `Mailer service started with schedule: ${CRON_SCHEDULE} and rate limit: ${RATE_LIMIT || 'none'}`
);

console.log('Starting scheduled task...');

cron.schedule(CRON_SCHEDULE, async () => {
  await sendQueuedEmails();
});
