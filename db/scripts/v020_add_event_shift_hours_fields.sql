-- IF NOT EXISTS: databases migrated from upstream already have
-- "requiredVolunteerHours", "description" and "volunteerHours" (upstream v020-v022),
-- which made this script fail and left "timeFormat" missing.
ALTER TABLE "event"
ADD COLUMN IF NOT EXISTS "timeFormat" text NOT NULL DEFAULT '24h'
    CHECK ("timeFormat" IN ('12h', '24h')),
ADD COLUMN IF NOT EXISTS "requiredVolunteerHours" smallint NOT NULL DEFAULT 0
    CHECK ("requiredVolunteerHours" >= 0);

ALTER TABLE "shift"
ADD COLUMN IF NOT EXISTS "description" text NOT NULL DEFAULT '',
-- Hours credited for the shift; NULL falls back to "durationHours"
ADD COLUMN IF NOT EXISTS "volunteerHours" smallint
    CHECK ("volunteerHours" > 0);
