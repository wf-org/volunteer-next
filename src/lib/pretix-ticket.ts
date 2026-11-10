/**
 * Pretix ticket access checks for event-level authorisation.
 */

type PretixConfig = {
  apiBaseUrl: string;
  organizer: string;
  apiToken: string;
};


// TODO: check it's using attendee_email. Need a multiple person order to confirm this

type PretixOrder = {
  code?: string;
  secret?: string;
  status?: string;
  testmode?: boolean;
  email?: string;
  positions?: Array<{
    canceled?: boolean;
    item?: number;
    attendee_email?: string;
    attendee_name?: string;
  }>;
};

export type PretixAttendee = {
  email: string;
  name?: string;
};

const cleanEnvValue = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return value.split(/\s+#/)[0].trim();
};

const normaliseEmail = (email: string | undefined | null): string | null => {
  if (!email) {
    return null;
  }
  const normalised = email.trim().toLowerCase();
  return normalised.length > 0 ? normalised : null;
};

const isTruthy = (value: string | undefined, defaultValue = false): boolean => {
  const cleaned = cleanEnvValue(value);
  if (cleaned === undefined || cleaned.length === 0) {
    return defaultValue;
  }
  return cleaned.toLowerCase() === 'true';
};

const parseOrganizerFromDiscoveryUrl = (discoveryUrl: string | undefined): string | null => {
  if (!discoveryUrl) {
    return null;
  }
  try {
    const url = new URL(discoveryUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[0] ?? null;
  } catch {
    return null;
  }
};

const parseApiBaseFromDiscoveryUrl = (discoveryUrl: string | undefined): string | null => {
  if (!discoveryUrl) {
    return null;
  }
  try {
    const url = new URL(discoveryUrl);
    return url.origin;
  } catch {
    return null;
  }
};

const getPretixConfig = (): PretixConfig | null => {
  const explicitApiBaseUrl = cleanEnvValue(process.env.PRETIX_API_BASE_URL);
  const explicitOrganizer = cleanEnvValue(process.env.PRETIX_ORGANIZER);
  const explicitApiToken = cleanEnvValue(process.env.PRETIX_API_TOKEN);
  const apiBaseUrl = explicitApiBaseUrl ?? parseApiBaseFromDiscoveryUrl(process.env.OAUTH_DISCOVERY_URL);
  const organizer = explicitOrganizer ?? parseOrganizerFromDiscoveryUrl(process.env.OAUTH_DISCOVERY_URL);
  const apiToken = explicitApiToken;

  if (!apiBaseUrl || !organizer || !apiToken) {
    return null;
  }

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ''),
    organizer,
    apiToken
  };
};

const buildOrdersUrl = (config: PretixConfig, eventSlug: UrlSlug, email: string): URL => {
  const endpoint = `${config.apiBaseUrl}/api/v1/organizers/${encodeURIComponent(config.organizer)}/events/${encodeURIComponent(eventSlug)}/orders/`;
  const url = new URL(endpoint);
  url.searchParams.set('email__iexact', email);
  url.searchParams.set('status', 'p');
  return url;
};

const buildEventOrdersUrl = (config: PretixConfig, eventSlug: UrlSlug, next?: string): URL => {
  if (next) {
    return new URL(next);
  }
  const endpoint = `${config.apiBaseUrl}/api/v1/organizers/${encodeURIComponent(config.organizer)}/events/${encodeURIComponent(eventSlug)}/orders/`;
  const url = new URL(endpoint);
  url.searchParams.set('status', 'p');
  return url;
};

const getRequiredPretixItemIds = (): Set<number> => {
  const raw = cleanEnvValue(process.env.PRETIX_REQUIRED_ITEM_IDS);
  if (!raw) {
    return new Set<number>();
  }
  return new Set(
    raw
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v))
  );
};

const evaluateOrderTicketState = (
  order: PretixOrder,
  checkedEmail: string,
  requiredItemIds: Set<number>
): boolean => {
  if (order.testmode === true) {
    return false;
  }
  if (order.status && order.status !== 'p') {
    return false;
  }
  if (!Array.isArray(order.positions)) {
    return true;
  }

  const activePositions = order.positions.filter((position) => position.canceled !== true);
  if (activePositions.length === 0) {
    return false;
  }

  const requiredItemsConfigured = requiredItemIds.size > 0;
  const positionsAfterItemFilter = requiredItemsConfigured
    ? activePositions.filter((position) =>
        typeof position.item === 'number' ? requiredItemIds.has(position.item) : false
      )
    : activePositions;

  if (requiredItemsConfigured && positionsAfterItemFilter.length === 0) {
    return false;
  }

  const targetEmail = normaliseEmail(checkedEmail);
  if (!targetEmail) {
    return false;
  }
  const positionsWithAttendeeEmail = positionsAfterItemFilter.filter(
    (position) => normaliseEmail(position.attendee_email) !== null
  );
  if (positionsWithAttendeeEmail.length === 0) {
    return false;
  }

  const matchingAttendeeCount = positionsWithAttendeeEmail.filter(
    (position) => normaliseEmail(position.attendee_email) === targetEmail
  ).length;

  if (matchingAttendeeCount > 0) {
    return true;
  }

  return false;
};

const normaliseName = (name: string | undefined | null): string | undefined => {
  if (!name) {
    return undefined;
  }
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toOrderAttendees = (order: PretixOrder, requiredItemIds: Set<number>): PretixAttendee[] => {
  if (order.testmode === true) {
    return [];
  }
  if (order.status && order.status !== 'p') {
    return [];
  }

  const activePositions = (order.positions ?? []).filter((position) => position.canceled !== true);
  if (activePositions.length === 0) {
    return [];
  }

  const positions =
    requiredItemIds.size > 0
      ? activePositions.filter((position) =>
          typeof position.item === 'number' ? requiredItemIds.has(position.item) : false
        )
      : activePositions;

  const attendees = positions
    .map((position) => {
      const email = normaliseEmail(position.attendee_email ?? order.email);
      if (!email) {
        return null;
      }
      return {
        email,
        name: normaliseName(position.attendee_name)
      } as PretixAttendee;
    })
    .filter((attendee): attendee is PretixAttendee => attendee !== null);

  return attendees;
};

/**
 * Returns true when ticket checks are enabled and should be enforced.
 */
export const isPretixTicketCheckEnabled = (): boolean => {
  return isTruthy(process.env.PRETIX_REQUIRE_VALID_TICKET, true);
};

/**
 * Checks if a user has at least one paid order for the event in Pretix.
 */
export const hasValidPretixTicketForEvent = async (
  email: string,
  eventSlug: UrlSlug
): Promise<boolean> => {
  const ticketCheckEnabled = isPretixTicketCheckEnabled();

  if (!ticketCheckEnabled) {
    return true;
  }

  const config = getPretixConfig();
  const requiredItemIds = getRequiredPretixItemIds();
  if (!config) {
    console.warn('[pretix-ticket] Ticket checks enabled but Pretix config is incomplete');
    return false;
  }

  const url = buildOrdersUrl(config, eventSlug, email);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Token ${config.apiToken}`,
        Accept: 'application/json'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      console.warn(
        '[pretix-ticket] Pretix API returned non-success status %s for event %s',
        response.status,
        eventSlug
      );
      return false;
    }

    const data = (await response.json()) as { count?: number; results?: unknown[] };
    const orders = Array.isArray(data.results) ? (data.results as PretixOrder[]) : null;
    const hasTicket =
      orders !== null
        ? orders.some((order) => evaluateOrderTicketState(order, email, requiredItemIds))
        : typeof data.count === 'number'
          ? data.count > 0
          : false;

    return hasTicket;
  } catch (error) {
    console.warn(
      '[pretix-ticket] Pretix API request failed for event %s',
      eventSlug,
      error
    );
    return false;
  }
};

/**
 * Retrieves all paid attendees for an event from Pretix.
 */
export const getPretixAttendeesForEvent = async (eventSlug: UrlSlug): Promise<PretixAttendee[]> => {
  const config = getPretixConfig();
  const requiredItemIds = getRequiredPretixItemIds();
  if (!config) {
    throw new Error('Pretix config is incomplete');
  }

  const attendeesByEmail = new Map<string, PretixAttendee>();
  let nextUrl: string | undefined;
  let pageCount = 0;

  do {
    const url = buildEventOrdersUrl(config, eventSlug, nextUrl);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Token ${config.apiToken}`,
        Accept: 'application/json'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Pretix API returned ${response.status}`);
    }

    const data = (await response.json()) as {
      results?: PretixOrder[];
      next?: string | null;
    };

    for (const order of data.results ?? []) {
      for (const attendee of toOrderAttendees(order, requiredItemIds)) {
        const existing = attendeesByEmail.get(attendee.email);
        if (!existing) {
          attendeesByEmail.set(attendee.email, attendee);
          continue;
        }
        if (!existing.name && attendee.name) {
          attendeesByEmail.set(attendee.email, attendee);
        }
      }
    }

    nextUrl = data.next ?? undefined;
    pageCount += 1;
    if (pageCount > 200) {
      throw new Error('Pretix pagination exceeded safety limit');
    }
  } while (nextUrl);

  return Array.from(attendeesByEmail.values());
};
