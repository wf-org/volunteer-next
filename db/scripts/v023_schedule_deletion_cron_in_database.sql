DO $do$
DECLARE
    target_db text;
BEGIN
    -- Cloud SQL requires pg_cron to be installed from the "postgres" database.
    IF current_database() <> 'postgres' THEN
        RAISE NOTICE 'Skipping Cloud SQL pg_cron schedule setup in database "%". Run this migration against "postgres" to configure cron.schedule_in_database(...).', current_database();
        RETURN;
    END IF;

    CREATE EXTENSION IF NOT EXISTS pg_cron;

    -- Set this in session before running migration against postgres:
    --   SET volunteer_next.cron_target_db = 'your_app_database';
    target_db := current_setting('volunteer_next.cron_target_db', true);

    IF target_db IS NULL OR btrim(target_db) = '' THEN
        RAISE NOTICE 'Skipping cron.schedule_in_database: volunteer_next.cron_target_db is not set.';
        RETURN;
    END IF;

    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'remove_deleted_users';

    PERFORM cron.schedule_in_database(
        'remove_deleted_users',
        -- schedule: every day at midnight
        '0 0 * * *',
        $job$
        DELETE FROM "user"
        WHERE "deletedAt" IS NOT NULL
          AND "deletedAt" < now() - interval '30 days';
        $job$,
        target_db
    );
END;
$do$;
