DO $do$
BEGIN
    -- Cloud SQL allows pg_cron extension creation only in the "postgres" database.
    IF current_database() <> 'postgres' THEN
        RAISE NOTICE 'Skipping pg_cron setup in database "%". Enable pg_cron from the postgres database and schedule with cron.schedule_in_database(...).', current_database();
        RETURN;
    END IF;

    CREATE EXTENSION IF NOT EXISTS pg_cron;

    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'remove_deleted_users';

    PERFORM cron.schedule(
        'remove_deleted_users',
        -- schedule: every day at midnight
        '0 0 * * *',
                $job$
        DELETE FROM "user"
        WHERE "deletedAt" IS NOT NULL
          AND "deletedAt" < now() - interval '30 days'
        RETURNING "id";
                $job$
    );
END;
$do$;
