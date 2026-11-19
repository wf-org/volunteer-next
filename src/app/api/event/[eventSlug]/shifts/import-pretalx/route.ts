/**
 * Imports confirmed pretalx sessions (latest published schedule) as shifts,
 * and assigns each speaker to their session's shift by matching email.
 * Re-running the import updates existing shifts instead of duplicating them.
 */

import { inTransaction } from '@/db';
import { getPretalxEventSlug, getPretalxSessions, slotToShiftTiming } from '@/lib/pretalx';
import { getEventBySlug } from '@/service/event-service';
import {
  addVolunteerToShift,
  createShift,
  getPretalxShiftsForEvent,
  setShiftPretalxRef,
  updateShift
} from '@/service/shift-service';
import { getTeamById } from '@/service/team-service';
import { getUsers } from '@/service/user-service';
import { checkAuthorisation } from '@/session';
import { getEventShiftsPath } from '@/utils/path';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

/** Volunteer hours credited for every imported pretalx session, regardless of length. */
const PRETALX_SESSION_VOLUNTEER_HOURS = 2;

const redirectTo = (path: string): NextResponse =>
  new NextResponse(null, { status: 303, headers: { Location: path } });

const withImportStatus = (
  status: 'success' | 'failure',
  details?: Record<string, string | number>
): string => {
  const params = new URLSearchParams({ pretalxImport: status });
  for (const [key, value] of Object.entries(details ?? {})) {
    params.set(key, String(value));
  }
  return `${getEventShiftsPath()}?${params.toString()}`;
};

const getEventLengthDays = (event: EventInfo): number =>
  Math.round((event.endDate.getTime() - event.startDate.getTime()) / (1000 * 60 * 60 * 24));

export const POST = async (
  request: Request,
  { params }: RouteContext<'/api/event/[eventSlug]/shifts/import-pretalx'>
): Promise<Response> => {
  const importRunId = `pretalx-import-${Date.now()}`;
  const event = await getEventBySlug((await params).eventSlug);
  if (!event) {
    return new NextResponse(null, { status: 404 });
  }
  await checkAuthorisation([{ type: 'admin' }, { type: 'organiser', eventId: event.id }]);

  const formData = await request.formData();
  const teamId = formData.get('teamId')?.toString();
  const team = teamId ? await getTeamById(teamId) : null;
  if (!team || team.eventId !== event.id) {
    return redirectTo(withImportStatus('failure'));
  }

  try {
    const pretalxEventSlug = getPretalxEventSlug(event);
    console.info('[pretalx-import] start', { importRunId, eventId: event.id, pretalxEventSlug });

    const sessions = await getPretalxSessions(pretalxEventSlug);
    const existingShifts = await getPretalxShiftsForEvent(event.id);
    const usersByEmail = new Map<string, User>(
      (await getUsers())
        .filter((user) => !user.deletedAt)
        .map((user) => [user.email.trim().toLowerCase(), user])
    );
    const lastEventDay = getEventLengthDays(event);

    let createdCount = 0;
    let updatedCount = 0;
    let assignedCount = 0;
    let unmatchedSpeakerCount = 0;
    let skippedCount = 0;

    for (const session of sessions) {
      let timing: ReturnType<typeof slotToShiftTiming> | null = null;
      try {
        timing = slotToShiftTiming(event.startDate, session.start, session.end);
      } catch {
        // invalid slot times; counted as skipped below
      }
      if (!timing || timing.eventDay < 0 || timing.eventDay > lastEventDay) {
        console.warn('[pretalx-import] session has invalid time or is outside event dates, skipped', {
          importRunId,
          ref: session.ref
        });
        skippedCount += 1;
        continue;
      }

      const speakers = session.speakerEmails
        .map((email) => usersByEmail.get(email))
        .filter((user): user is User => user !== undefined);
      unmatchedSpeakerCount += session.speakerEmails.length - speakers.length;
      const speakerCount = Math.max(1, session.speakerEmails.length);

      await inTransaction(async (client) => {
        const existing = existingShifts.get(session.ref);
        let shiftId: ShiftId;
        if (existing) {
          const updated = await updateShift(
            {
              ...existing,
              title: session.title,
              description: session.abstract,
              ...timing,
              volunteerHours: PRETALX_SESSION_VOLUNTEER_HOURS,
              maxVolunteers: Math.max(existing.maxVolunteers, speakerCount)
            },
            client
          );
          shiftId = updated.id;
          updatedCount += 1;
        } else {
          const created = await createShift(
            {
              teamId: team.id,
              title: session.title,
              description: session.abstract,
              ...timing,
              volunteerHours: PRETALX_SESSION_VOLUNTEER_HOURS,
              minVolunteers: speakerCount,
              maxVolunteers: speakerCount,
              isActive: true,
              requirements: []
            },
            client
          );
          await setShiftPretalxRef(created.id, session.ref, client);
          shiftId = created.id;
          createdCount += 1;
        }

        for (const speaker of speakers) {
          if (await addVolunteerToShift(shiftId, speaker.id, client)) {
            assignedCount += 1;
          }
        }
      });
    }

    const sessionRefs = new Set(sessions.map((s) => s.ref));
    const notInScheduleCount = Array.from(existingShifts.keys()).filter(
      (ref) => !sessionRefs.has(ref)
    ).length;

    const summary = {
      sessionCount: sessions.length,
      createdCount,
      updatedCount,
      assignedCount,
      unmatchedSpeakerCount,
      skippedCount,
      notInScheduleCount
    };
    console.info('[pretalx-import] complete', { importRunId, eventId: event.id, ...summary });
    revalidatePath(getEventShiftsPath());
    return redirectTo(withImportStatus('success', summary));
  } catch (error) {
    console.error('[pretalx-import] failed', { importRunId, eventId: event.id, error });
    return redirectTo(withImportStatus('failure'));
  }
};
