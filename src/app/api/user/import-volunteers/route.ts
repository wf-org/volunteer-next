import { getPretixAttendeesForEvent } from '@/lib/pretix-ticket';
import {
  createUser,
  getUsers,
  undeleteUser,
  updateUser
} from '@/service/user-service';
import { checkAuthorisation, getCurrentEvent } from '@/session';
import { getEventsPath, getUsersDashboardPath } from '@/utils/path';
import { NextResponse } from 'next/server';

const redirectTo = (path: string): NextResponse =>
  new NextResponse(null, {
    status: 303,
    headers: {
      Location: path
    }
  });

const withImportStatus = (
  status: 'success' | 'failure',
  details?: Record<string, string | number>
): string => {
  const params = new URLSearchParams({ importStatus: status });
  if (details) {
    for (const [key, value] of Object.entries(details)) {
      params.set(key, String(value));
    }
  }
  return `${getUsersDashboardPath()}?${params.toString()}`;
};

const normaliseEmail = (email: string): string => email.trim().toLowerCase();

const getFallbackNameFromEmail = (email: string): string => {
  const localPart = email.split('@')[0]?.trim();
  return localPart && localPart.length > 0 ? localPart : email;
};

const mergeName = (preferredName: string | undefined, fallbackEmail: string): string => {
  const trimmed = preferredName?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }
  return getFallbackNameFromEmail(fallbackEmail);
};

export const POST = async (): Promise<Response> => {
  const importRunId = `import-${Date.now()}`;

  console.info('[user-import] start', { importRunId });
  await checkAuthorisation([{ type: 'admin' }]);

  const event = await getCurrentEvent();
  if (!event) {
    console.warn('[user-import] skipped: no current event', { importRunId });
    return redirectTo(getEventsPath());
  }

  try {
    console.info('[user-import] fetching attendees from Pretix', {
      importRunId,
      eventId: event.id,
      eventSlug: event.slug
    });

    const attendees = await getPretixAttendeesForEvent(event.slug);
    const existingUsers = await getUsers();
    const usersByEmail = new Map<string, User>(
      existingUsers.map((user) => [normaliseEmail(user.email), user])
    );

    let createdCount = 0;
    let updatedCount = 0;
    let undeletedCount = 0;

    console.info('[user-import] fetched data', {
      importRunId,
      attendeeCount: attendees.length,
      existingUserCount: existingUsers.length
    });

    for (const attendee of attendees) {
      const existing = usersByEmail.get(normaliseEmail(attendee.email));
      if (!existing) {
        const name = mergeName(attendee.name, attendee.email);
        const created = await createUser({
          name,
          chosenName: name,
          email: attendee.email
        });
        usersByEmail.set(normaliseEmail(created.email), created);
        createdCount += 1;
        continue;
      }

      if (existing.deletedAt) {
        await undeleteUser(existing.id);
        undeletedCount += 1;
      }

      const desiredChosenName = mergeName(attendee.name, attendee.email);
      if (existing.chosenName !== desiredChosenName) {
        await updateUser(existing.id, {
          id: existing.id,
          name: existing.name,
          chosenName: desiredChosenName,
          email: existing.email
        });
        updatedCount += 1;
      }
    }

    console.info('[user-import] complete', {
      importRunId,
      eventId: event.id,
      eventSlug: event.slug,
      attendeeCount: attendees.length,
      createdCount,
      updatedCount,
      undeletedCount
    });

    return redirectTo(
      withImportStatus('success', {
        attendeeCount: attendees.length,
        createdCount,
        updatedCount,
        undeletedCount
      })
    );
  } catch (error) {
    console.error('[user-import] failed', {
      importRunId,
      eventId: event.id,
      eventSlug: event.slug,
      error
    });

    return redirectTo(withImportStatus('failure'));
  }
};
