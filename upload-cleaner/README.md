# volunteer-next/upload-cleaner

A service for removing unused uploads

## Environment

The service requires the following environment variables:

| Variable                   | Description                                  | Default      |
| -------------------------- | -------------------------------------------- | ------------ |
| CRON_SCHEDULE              | Service schedule in crontab syntax           | 0 0 \* \* \* |
| POSTGRES_HOST              | Postgres host                                | localhost    |
| POSTGRES_USER              | Postgres user                                | postgres     |
| POSTGRES_PASSWORD          | Postgres password                            | example      |
| POSTGRES_DB                | Postgres database                            | postgres     |
| POSTGRES_PORT              | Postgres port                                | 5432         |
| UPLOADS_DIR                | The path to uploaded stuff to clean up       | ../uploads   |
| UPLOADS_BUCKET             | S3 bucket to clean up instead of UPLOADS_DIR | (unset)      |
| FILE_AGE_THRESHOLD_SECONDS | Files younger than this are safe             | 3600         |

## Running

- **docker compose**: the default image stage (`runner`) runs `index.ts`, which cleans up on `CRON_SCHEDULE`.
- **AWS Lambda**: the `lambda` stage (`docker build --target lambda`) runs one cleanup per invocation (`lambda.handler`); EventBridge Scheduler sets the schedule, so `CRON_SCHEDULE` is unused.
