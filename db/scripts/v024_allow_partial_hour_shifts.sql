-- Allow shift lengths and credited volunteer hours in quarter-hour increments.
-- numeric(7,2) holds every existing smallint value (max 32767).
ALTER TABLE "shift"
ALTER COLUMN "durationHours" TYPE numeric(7,2),
ALTER COLUMN "volunteerHours" TYPE numeric(7,2);

ALTER TABLE "shift"
ADD CONSTRAINT "shift_durationHours_quarter_hour"
    CHECK (("durationHours" * 4) = floor("durationHours" * 4)),
ADD CONSTRAINT "shift_volunteerHours_quarter_hour"
    CHECK ("volunteerHours" IS NULL OR ("volunteerHours" * 4) = floor("volunteerHours" * 4));
