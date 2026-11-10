/**
 * Service for managing events in the database
 * @since 2025-11-12
 * @author Michael Townsend <@continuities>
 */

import pool from '@/db';
import { PoolClient } from 'pg';
import { cache } from 'react';

const rowToEvent = (row: any): EventInfo => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  startDate: row.startDate,
  endDate: row.endDate,
  timeFormat: row.timeFormat ?? '24h',
  requiredVolunteerHours: Number(row.requiredVolunteerHours ?? 0),
  archived: Boolean(row.archivedAt),
  logo: row.logo ?? undefined,
  logoDark: row.logo_dark ?? undefined,
  favicon: row.favicon ?? undefined
});

/**
 * Fetches a list of all events from the database.
 * @return An array of EventInfo objects.
 */
export const getEvents = cache(async (): Promise<EventInfo[]> => {
  const result = await pool.query(
    `
    SELECT 
      id, 
      name,
      "slug", 
      "startDate", 
      "endDate", 
      "timeFormat",
      "requiredVolunteerHours",
      "archivedAt", 
      "logo", 
      "logo_dark", 
      "favicon" 
    FROM event
    ORDER BY "startDate" DESC
    `
  );
  return result.rows.map(rowToEvent);
});

export const getFilteredEvents = cache(async (filter: EventFilters): Promise<EventInfo[]> => {
  const filterConditions: string[] = [];
  const filterValues: any[] = [];

  if (filter.searchQuery) {
    filterValues.push(`%${filter.searchQuery}%`);
    filterConditions.push(`name ILIKE $${filterValues.length}`);
  }

  if (!filter.showArchived) {
    filterConditions.push(`"archivedAt" IS NULL`);
  }

  const result = await pool.query(
    `
    SELECT 
      id, 
      name,
      "slug", 
      "startDate",
      "endDate",
      "timeFormat",
      "requiredVolunteerHours",
      "archivedAt",
      "logo",
      "logo_dark",
      "favicon"

    FROM event 
    ${filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : ''}
    `,
    filterValues
  );
  return result.rows.map(rowToEvent);
});

/**
 * Fetches a list of events that have not yet ended.
 * @returns An array of EventInfo objects.
 */
export const getActiveEvents = cache(async (): Promise<EventInfo[]> => {
  const result = await pool.query(
    `
      SELECT
        id,
        name,
        "slug",
        "startDate",
        "endDate",
        "timeFormat",
        "requiredVolunteerHours",
        "archivedAt",
        "logo",
        "logo_dark",
        "favicon"
        
      FROM event
      WHERE "endDate" >= CURRENT_DATE
      ORDER BY "startDate" ASC
    `
  );
  return result.rows.map(rowToEvent);
});

/**
 * Fetches events by ID.
 * @param eventIds - The event ids to fetch
 * @return An array of EventInfo objects matching the provided IDs.
 */
export const getEventsById = cache(async (eventIds: EventId[]): Promise<EventInfo[]> => {
  if (eventIds.length === 0) {
    return [];
  }
  const result = await pool.query(
    `SELECT id, name, "slug", "startDate", "endDate", "timeFormat", "requiredVolunteerHours", "archivedAt", "logo", "logo_dark","favicon" FROM event WHERE id = ANY($1)`,
    [eventIds]
  );
  return result.rows.map(rowToEvent);
});

/**
 * Fetches a specific event by its slug.
 * @param slug - The slug identifier of the event.
 * @return The EventInfo object if found, or null if not found.
 */
export const getEventBySlug = cache(async (slug: string): Promise<EventInfo | null> => {
  const result = await pool.query(
    'SELECT id, name, "slug", "startDate", "endDate", "timeFormat", "requiredVolunteerHours", "archivedAt", "logo", "logo_dark","favicon" FROM event WHERE "slug" = $1',
    [slug]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return rowToEvent(result.rows[0]);
});

/**
 * Creates a new event in the database.
 * @param event - The event data, excluding the ID.
 * @param client - Optional database client for transaction support.
 * @return The newly created EventInfo object, including its ID.
 */
export const createEvent = async (
  event: Omit<EventInfo, 'id'>,
  client?: PoolClient
): Promise<EventInfo> => {
  const db = client || pool;
  const result = await db.query(
    `
    INSERT INTO event (
      name, 
      "slug", 
      "startDate", 
      "endDate", 
      "timeFormat",
      "requiredVolunteerHours",
      "logo", 
      "logo_dark", 
      "favicon"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
    RETURNING 
      id, 
      "slug", 
      name, 
      "startDate", 
      "endDate", 
      "timeFormat",
      "requiredVolunteerHours",
      "logo", 
      "logo_dark",
      "favicon"`,
    [
      event.name,
      event.slug,
      event.startDate.toISOString(),
      event.endDate.toISOString(),
      event.timeFormat ?? '24h',
      event.requiredVolunteerHours,
      event.logo,
      event.logoDark,
      event.favicon
    ]
  );
  const newEvent = rowToEvent(result.rows[0]);
  console.info('Created new event:', newEvent);
  return newEvent;
};

/**
 * Updates an existing event in the database.
 * @param event - The event data to update, including its ID.
 * @param client - Optional database client for transaction support.
 * @returns The updated EventInfo object.
 */
export const updateEvent = async (event: EventInfo, client?: PoolClient): Promise<EventInfo> => {
  const db = client || pool;
  const result = await db.query(
    `UPDATE event 
    SET 
      name = $1, 
      "slug" = $2, 
      "startDate" = $3, 
      "endDate" = $4, 
      "timeFormat" = $5,
      "requiredVolunteerHours" = $6,
      "logo" = $7, 
      "logo_dark" = $8,
      "favicon" = $9 
    WHERE id = $10 
    RETURNING 
      id, 
      name, 
      "slug", 
      "startDate", 
      "endDate", 
      "timeFormat",
      "requiredVolunteerHours",
      "logo", 
      "logo_dark", 
      "favicon"`,
    [
      event.name,
      event.slug,
      event.startDate.toISOString(),
      event.endDate.toISOString(),
      event.timeFormat ?? '24h',
      event.requiredVolunteerHours,
      event.logo,
      event.logoDark,
      event.favicon,
      event.id
    ]
  );
  const updatedEvent = rowToEvent(result.rows[0]);
  console.info('Updated event:', updatedEvent);
  return updatedEvent;
};

/**
 * Deletes an event from the database.
 * @param eventId - The ID of the event to delete.
 * @param client - Optional database client for transaction support.
 */
export const deleteEvent = async (eventId: EventId, client?: PoolClient): Promise<void> => {
  const db = client || pool;
  await db.query('DELETE FROM event WHERE id = $1', [eventId]);
  console.info('Deleted event with id:', eventId);
};

/**
 * Archives or unarchives an event
 * @param eventId - The ID of the event to archive or unarchive.
 * @param archived - Whether to archive (true) or unarchive (false) the event.
 * @param client - Optional database client for transaction support.
 */
export const archiveEvent = async (
  eventId: EventId,
  archived: boolean,
  client?: PoolClient
): Promise<void> => {
  const db = client || pool;
  if (archived) {
    await db.query('UPDATE event SET "archivedAt" = CURRENT_TIMESTAMP WHERE id = $1', [eventId]);
    console.info('Archived event with id:', eventId);
  } else {
    await db.query('UPDATE event SET "archivedAt" = NULL WHERE id = $1', [eventId]);
    console.info('Unarchived event with id:', eventId);
  }
};

/**
 * Copies teams, qualifications, shifts and shift requirements from one event into another.
 * Volunteers, sign-ups and team-lead roles are not copied.
 * Must be run inside a transaction (uses a temp table dropped on commit).
 * @param sourceEventId - The event to copy from.
 * @param targetEventId - The (newly created) event to copy into.
 * @param client - Database client in an open transaction.
 */
export const cloneEventStructure = async (
  sourceEventId: EventId,
  targetEventId: EventId,
  client: PoolClient
): Promise<void> => {
  await client.query(
    `CREATE TEMP TABLE clone_id_map (old_id uuid PRIMARY KEY, new_id uuid NOT NULL) ON COMMIT DROP`
  );

  // Teams
  await client.query(
    `INSERT INTO clone_id_map (old_id, new_id)
     SELECT id, uuid_generate_v4() FROM team WHERE "eventId" = $1`,
    [sourceEventId]
  );
  await client.query(
    `INSERT INTO team (id, name, "eventId", slug, description, "contactAddress")
     SELECT m.new_id, t.name, $2, t.slug, t.description, t."contactAddress"
     FROM team t JOIN clone_id_map m ON m.old_id = t.id
     WHERE t."eventId" = $1`,
    [sourceEventId, targetEventId]
  );

  // Qualifications (event-wide or team-scoped)
  await client.query(
    `INSERT INTO clone_id_map (old_id, new_id)
     SELECT id, uuid_generate_v4() FROM qualification WHERE "eventId" = $1`,
    [sourceEventId]
  );
  await client.query(
    `INSERT INTO qualification (id, "eventId", "teamId", name, "errorMessage")
     SELECT m.new_id, $2, tm.new_id, q.name, q."errorMessage"
     FROM qualification q
     JOIN clone_id_map m ON m.old_id = q.id
     LEFT JOIN clone_id_map tm ON tm.old_id = q."teamId"
     WHERE q."eventId" = $1`,
    [sourceEventId, targetEventId]
  );

  // Shifts
  await client.query(
    `INSERT INTO clone_id_map (old_id, new_id)
     SELECT s.id, uuid_generate_v4()
     FROM shift s JOIN team t ON t.id = s."teamId"
     WHERE t."eventId" = $1`,
    [sourceEventId]
  );
  await client.query(
    `INSERT INTO shift (
       id, "teamId", title, description, "eventDay", "startTime", "durationHours",
       "volunteerHours", "minVolunteers", "maxVolunteers", "isActive"
     )
     SELECT sm.new_id, tm.new_id, s.title, s.description, s."eventDay", s."startTime",
       s."durationHours", s."volunteerHours", s."minVolunteers", s."maxVolunteers", s."isActive"
     FROM shift s
     JOIN team t ON t.id = s."teamId"
     JOIN clone_id_map sm ON sm.old_id = s.id
     JOIN clone_id_map tm ON tm.old_id = s."teamId"
     WHERE t."eventId" = $1`,
    [sourceEventId]
  );

  // Shift requirements
  await client.query(
    `INSERT INTO requirement ("shiftId", "qualificationId")
     SELECT sm.new_id, qm.new_id
     FROM requirement r
     JOIN clone_id_map sm ON sm.old_id = r."shiftId"
     JOIN clone_id_map qm ON qm.old_id = r."qualificationId"`
  );

  console.info('Cloned event structure:', { sourceEventId, targetEventId });
};
