ALTER TABLE "event"
ADD COLUMN "timeFormat" text NOT NULL DEFAULT '24h',
ADD CONSTRAINT "event_timeFormat_check" CHECK ("timeFormat" IN ('12h', '24h'));
