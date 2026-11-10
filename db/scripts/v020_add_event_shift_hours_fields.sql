ALTER TABLE "event"
ADD COLUMN "timeFormat" text NOT NULL DEFAULT '24h'
    CHECK ("timeFormat" IN ('12h', '24h')),
ADD COLUMN "requiredVolunteerHours" smallint NOT NULL DEFAULT 0
    CHECK ("requiredVolunteerHours" >= 0);

ALTER TABLE "shift"
ADD COLUMN "description" text NOT NULL DEFAULT '',
-- Hours credited for the shift; NULL falls back to "durationHours"
ADD COLUMN "volunteerHours" smallint
    CHECK ("volunteerHours" > 0);
