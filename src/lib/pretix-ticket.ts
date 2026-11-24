/**
 * Pretix ticket access checks for event-level authorisation.
 */

type PretixConfig = {
  apiBaseUrl: string;
  organizer: string;
  apiToken: string;
};

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
  const apiBaseUrl =
    explicitApiBaseUrl ?? parseApiBaseFromDiscoveryUrl(process.env.OAUTH_DISCOVERY_URL);
  const organizer =
    explicitOrganizer ?? parseOrganizerFromDiscoveryUrl(process.env.OAUTH_DISCOVERY_URL);
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

/**
 * Paid orders for an event. `search` matches attendee emails as well as the purchaser's
 * (substring, case-insensitive), so callers must still compare emails exactly.
 * https://docs.pretix.eu/dev/api/resources/orders.html
 */
const buildEventOrdersUrl = (
  config: PretixConfig,
  eventSlug: UrlSlug,
  options: { next?: string; search?: string } = {}
): URL => {
  if (options.next) {
    return new URL(options.next);
  }
  const endpoint = `${config.apiBaseUrl}/api/v1/organizers/${encodeURIComponent(config.organizer)}/events/${encodeURIComponent(eventSlug)}/orders/`;
  const url = new URL(endpoint);
  url.searchParams.set('status', 'p');
  if (options.search) {
    url.searchParams.set('search', options.search);
  }
  return url;
};

const MAX_PAGES = 200;

/**
 * Fetches every page of paid orders for an event. Throws on a non-success response.
 */
const fetchPaidOrders = async (
  config: PretixConfig,
  eventSlug: UrlSlug,
  search?: string
): Promise<PretixOrder[]> => {
  const orders: PretixOrder[] = [];
  let nextUrl: string | undefined;
  let pageCount = 0;
  do {
    const url = buildEventOrdersUrl(config, eventSlug, { next: nextUrl, search });
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
    const data = (await response.json()) as { results?: PretixOrder[]; next?: string | null };
    orders.push(...(data.results ?? []));
    nextUrl = data.next ?? undefined;
    pageCount += 1;
    if (pageCount > MAX_PAGES) {
      throw new Error('Pretix pagination exceeded safety limit');
    }
  } while (nextUrl);
  return orders;
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

const normaliseName = (name: string | undefined | null): string | undefined => {
  if (!name) {
    return undefined;
  }
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Ticket holders in an order: each active (and, if configured, required-item) position
 * belongs to its attendee email, or to the purchaser's email when none was entered.
 */
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

  const targetEmail = normaliseEmail(email);
  if (!targetEmail) {
    return false;
  }

  try {
    const orders = await fetchPaidOrders(config, eventSlug, targetEmail);
    return orders.some((order) =>
      toOrderAttendees(order, requiredItemIds).some((attendee) => attendee.email === targetEmail)
    );
  } catch (error) {
    console.warn('[pretix-ticket] Pretix ticket check failed for event %s', eventSlug, error);
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
  for (const order of await fetchPaidOrders(config, eventSlug)) {
    for (const attendee of toOrderAttendees(order, requiredItemIds)) {
      const existing = attendeesByEmail.get(attendee.email);
      if (!existing || (!existing.name && attendee.name)) {
        attendeesByEmail.set(attendee.email, attendee);
      }
    }
  }

  return Array.from(attendeesByEmail.values());
};
