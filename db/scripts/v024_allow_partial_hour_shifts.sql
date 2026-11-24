-- Allow shift lengths and credited volunteer hours in quarter-hour increments.
ALTER TABLE "shift"
ALTER COLUMN "durationHours" TYPE numeric(4,2),
ALTER COLUMN "volunteerHours" TYPE numeric(4,2);

ALTER TABLE "shift"
ADD CONSTRAINT "shift_durationHours_quarter_hour"
    CHECK ("durationHours" > 0 AND ("durationHours" * 4) = floor("durationHours" * 4)),
ADD CONSTRAINT "shift_volunteerHours_quarter_hour"
    CHECK ("volunteerHours" IS NULL OR ("volunteerHours" * 4) = floor("volunteerHours" * 4));
