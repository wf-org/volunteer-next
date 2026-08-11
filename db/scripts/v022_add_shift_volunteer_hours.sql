ALTER TABLE shift
ADD COLUMN "volunteerHours" smallint;

ALTER TABLE shift
ADD CONSTRAINT shift_volunteer_hours_check
CHECK ("volunteerHours" IS NULL OR "volunteerHours" > 0);