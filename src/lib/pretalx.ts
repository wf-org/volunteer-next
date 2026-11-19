/**
 * Pretalx API client for importing confirmed sessions as volunteer shifts.
 * Uses the latest published schedule: GET /api/events/{event}/slots/
 * Speaker emails come from GET /api/events/{event}/speakers/, because the submission
 * expanded inside a slot uses pretalx's public serializer, which never includes emails.
 * https://docs.pretalx.org/api/resources/
 */

type PretalxConfig = {
  apiBaseUrl: string;
  apiToken: string;
};

type MultiLanguageString = string | Record<string, string> | null | undefined;

type PretalxSpeaker = {
  code?: string;
  name?: string;
  email?: string | null;
};

type PretalxSubmission = {
  code: string;
  title?: string;
  abstract?: string | null;
  state?: string;
  speakers?: Array<PretalxSpeaker | string>;
  track?: { name?: MultiLanguageString } | number | null;
};

type PretalxSlot = {
  id: number;
  start?: string | null;
  end?: string | null;
  submission?: PretalxSubmission | string | null;
};

export type PretalxSession = {
  /** Stable reference: "<submission code>#<slot index>" */
  ref: string;
  submissionCode: string;
  title: string;
  abstract: string;
  track?: string;
  start: string;
  end: string;
  speakerEmails: string[];
};

export type ShiftTiming = Pick<ShiftInfo, 'eventDay' | 'startTime' | 'durationHours'>;

const cleanEnvValue = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const cleaned = value.split(/\s+#/)[0].trim();
  return cleaned.length > 0 ? cleaned : undefined;
};

const normaliseEmail = (email: string | undefined | null): string | null => {
  const normalised = email?.trim().toLowerCase();
  return normalised ? normalised : null;
};

const toPlainString = (value: MultiLanguageString): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  return value.en ?? Object.values(value)[0];
};

const getPretalxConfig = (): PretalxConfig | null => {
  const apiBaseUrl = cleanEnvValue(process.env.PRETALX_API_BASE_URL);
  const apiToken = cleanEnvValue(process.env.PRETALX_API_TOKEN);
  if (!apiBaseUrl || !apiToken) {
    return null;
  }
  return { apiBaseUrl: apiBaseUrl.replace(/\/$/, ''), apiToken };
};

/**
 * The pretalx event slug to import from. Defaults to the volunteer event slug.
 */
export const getPretalxEventSlug = (event: EventInfo): string =>
  cleanEnvValue(process.env.PRETALX_EVENT_SLUG) ?? event.slug;

export const isPretalxConfigured = (): boolean => getPretalxConfig() !== null;

/**
 * Converts a pretalx slot's start/end (ISO 8601, in the pretalx event's timezone)
 * into shift timing. Uses the local wall-clock date/time from the ISO string so
 * the shift shows the same time attendees see in the pretalx schedule.
 * Duration is rounded up to whole hours (shift durations are integer hours).
 */
export const slotToShiftTiming = (
  eventStartDate: Date,
  startIso: string,
  endIso: string
): ShiftTiming => {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(startIso);
  if (!match) {
    throw new Error(`Invalid pretalx slot start: ${startIso}`);
  }
  const [, datePart, hours, minutes] = match;
  const slotDay = new Date(`${datePart}T00:00:00Z`);
  const eventDay = Math.round(
    (slotDay.getTime() - eventStartDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const durationMinutes = (Date.parse(endIso) - Date.parse(startIso)) / (1000 * 60);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error(`Invalid pretalx slot duration: ${startIso} - ${endIso}`);
  }

  return {
    eventDay,
    startTime: `${hours}:${minutes}`,
    durationHours: Math.max(1, Math.ceil(durationMinutes / 60))
  };
};

/**
 * Converts raw pretalx slots into sessions: only confirmed submissions with a
 * scheduled start/end. Submissions with multiple slots get one session per slot.
 */
export const slotsToSessions = (
  slots: PretalxSlot[],
  speakerEmailsByCode: Map<string, string> = new Map()
): PretalxSession[] => {
  const bySubmission = new Map<string, Array<PretalxSlot & { submission: PretalxSubmission }>>();

  for (const slot of slots) {
    const submission = slot.submission;
    if (!submission || typeof submission === 'string') {
      continue; // breaks, or submission not expanded
    }
    if (submission.state !== 'confirmed' || !slot.start || !slot.end) {
      continue;
    }
    const list = bySubmission.get(submission.code) ?? [];
    list.push({ ...slot, submission });
    bySubmission.set(submission.code, list);
  }

  const sessions: PretalxSession[] = [];
  for (const [code, submissionSlots] of bySubmission) {
    submissionSlots.sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!));
    submissionSlots.forEach((slot, index) => {
      const { submission } = slot;
      const speakerEmails = Array.from(
        new Set(
          (submission.speakers ?? [])
            .map((speaker) => {
              const code = typeof speaker === 'string' ? speaker : speaker.code;
              const fromList = code ? speakerEmailsByCode.get(code) : undefined;
              return (
                fromList ?? (typeof speaker === 'string' ? null : normaliseEmail(speaker.email))
              );
            })
            .filter((email): email is string => email !== null)
        )
      );
      sessions.push({
        ref: `${code}#${index}`,
        submissionCode: code,
        title: submission.title?.trim() || code,
        abstract: submission.abstract?.trim() ?? '',
        track:
          submission.track && typeof submission.track === 'object'
            ? toPlainString(submission.track.name)
            : undefined,
        start: slot.start!,
        end: slot.end!,
        speakerEmails
      });
    });
  }
  return sessions;
};

const fetchAllPages = async <T>(config: PretalxConfig, firstUrl: URL): Promise<T[]> => {
  const results: T[] = [];
  let nextUrl: string | null = firstUrl.toString();
  let pageCount = 0;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      method: 'GET',
      headers: {
        Authorization: `Token ${config.apiToken}`,
        Accept: 'application/json',
        'Pretalx-Version': 'v1'
      },
      cache: 'no-store'
    });
    if (!response.ok) {
      throw new Error(`Pretalx API returned ${response.status}`);
    }
    const data = (await response.json()) as { results?: T[]; next?: string | null };
    results.push(...(data.results ?? []));
    nextUrl = data.next ?? null;
    pageCount += 1;
    if (pageCount > 200) {
      throw new Error('Pretalx pagination exceeded safety limit');
    }
  }
  return results;
};

/**
 * Fetches confirmed, scheduled sessions from the latest published pretalx schedule.
 * Requires an organiser API token so speaker emails are included.
 */
export const getPretalxSessions = async (pretalxEventSlug: string): Promise<PretalxSession[]> => {
  const config = getPretalxConfig();
  if (!config) {
    throw new Error('Pretalx config is incomplete');
  }
  const eventUrl = `${config.apiBaseUrl}/api/events/${encodeURIComponent(pretalxEventSlug)}`;

  const slotsUrl = new URL(`${eventUrl}/slots/`);
  slotsUrl.searchParams.set('expand', 'submission,submission.track');
  const slots = await fetchAllPages<PretalxSlot>(config, slotsUrl);

  const speakers = await fetchAllPages<PretalxSpeaker>(config, new URL(`${eventUrl}/speakers/`));
  const speakerEmailsByCode = new Map<string, string>();
  for (const speaker of speakers) {
    const email = normaliseEmail(speaker.email);
    if (speaker.code && email) {
      speakerEmailsByCode.set(speaker.code, email);
    }
  }
  if (speakers.length > 0 && speakerEmailsByCode.size === 0) {
    console.warn(
      '[pretalx] Speakers returned without emails; the API token needs organiser access to the event'
    );
  }

  return slotsToSessions(slots, speakerEmailsByCode);
};
