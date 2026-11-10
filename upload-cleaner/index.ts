import cron from 'node-cron';
import { cleanUploads } from './job.ts';

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 0 * * *';

console.log(`Upload Cleaner service started with schedule: ${CRON_SCHEDULE}`);

console.log('Starting scheduled task...');

cron.schedule(CRON_SCHEDULE, cleanUploads);
