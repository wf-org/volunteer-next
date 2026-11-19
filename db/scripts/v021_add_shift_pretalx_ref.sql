-- Links a shift to the pretalx talk slot it was imported from, so re-imports
-- update the existing shift instead of creating a duplicate.
-- Format: "<submission code>#<slot index>" (slot index is 0-based, ordered by start).
ALTER TABLE "shift"
ADD COLUMN IF NOT EXISTS "pretalxRef" text;

CREATE INDEX IF NOT EXISTS "shift_pretalx_ref_idx" ON "shift" ("pretalxRef")
    WHERE "pretalxRef" IS NOT NULL;
