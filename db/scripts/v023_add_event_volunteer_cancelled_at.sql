-- Set by the Pretix volunteer import when a previously imported ticket holder no longer
-- has a valid ticket (order cancelled, refunded, etc.). Cleared if they get one again.
ALTER TABLE "event_volunteer"
ADD COLUMN IF NOT EXISTS "cancelled_at" timestamptz;
