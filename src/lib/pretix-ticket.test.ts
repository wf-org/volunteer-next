import {
  getPretixAttendeesForEvent,
  hasValidPretixTicketForEvent,
  isPretixTicketCheckEnabled
} from './pretix-ticket';

describe('pretix-ticket', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('defaults ticket checks to enabled', () => {
    delete process.env.PRETIX_REQUIRE_VALID_TICKET;
    expect(isPretixTicketCheckEnabled()).toBe(true);
  });

  it('skips remote checks when ticket enforcement is disabled', async () => {
    process.env.PRETIX_REQUIRE_VALID_TICKET = 'false';
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await hasValidPretixTicketForEvent('person@example.org', 'my-event');

    expect(result).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('treats true with inline comment as enabled', async () => {
    process.env.PRETIX_REQUIRE_VALID_TICKET = 'true # enable checks';
    process.env.PRETIX_API_TOKEN = 'token';
    process.env.PRETIX_ORGANIZER = 'org';
    process.env.PRETIX_API_BASE_URL = 'https://tickets.example.org';

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ count: 0 })
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await hasValidPretixTicketForEvent('person@example.org', 'my-event');

    expect(result).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('fails closed when required config is missing', async () => {
    process.env.PRETIX_REQUIRE_VALID_TICKET = 'true';
    delete process.env.PRETIX_API_TOKEN;
    delete process.env.PRETIX_ORGANIZER;
    delete process.env.PRETIX_API_BASE_URL;
    delete process.env.OAUTH_DISCOVERY_URL;

    const result = await hasValidPretixTicketForEvent('person@example.org', 'my-event');

    expect(result).toBe(false);
  });

  it('returns true when Pretix reports paid orders', async () => {
    process.env.PRETIX_REQUIRE_VALID_TICKET = 'true';
    process.env.PRETIX_API_TOKEN = 'token';
    process.env.PRETIX_ORGANIZER = 'org';
    process.env.PRETIX_API_BASE_URL = 'https://tickets.example.org';

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ count: 1 })
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await hasValidPretixTicketForEvent('person@example.org', 'my-event');

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns false when Pretix reports no paid orders', async () => {
    process.env.PRETIX_REQUIRE_VALID_TICKET = 'true';
    process.env.PRETIX_API_TOKEN = 'token';
    process.env.PRETIX_ORGANIZER = 'org';
    process.env.PRETIX_API_BASE_URL = 'https://tickets.example.org';

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ count: 0 })
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await hasValidPretixTicketForEvent('person@example.org', 'my-event');

    expect(result).toBe(false);
  });

  it('accepts Pretix config values that contain inline comments', async () => {
    process.env.PRETIX_REQUIRE_VALID_TICKET = 'true';
    process.env.PRETIX_API_TOKEN = 'token # comment';
    process.env.PRETIX_ORGANIZER = 'org # comment';
    process.env.PRETIX_API_BASE_URL = 'https://tickets.example.org # comment';

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ count: 1 })
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await hasValidPretixTicketForEvent('person@example.org', 'my-event');

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores paid orders that are testmode-only', async () => {
    process.env.PRETIX_REQUIRE_VALID_TICKET = 'true';
    process.env.PRETIX_API_TOKEN = 'token';
    process.env.PRETIX_ORGANIZER = 'org';
    process.env.PRETIX_API_BASE_URL = 'https://tickets.example.org';

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        count: 1,
        results: [{ status: 'p', testmode: true, positions: [{ canceled: false }] }]
      })
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await hasValidPretixTicketForEvent('person@example.org', 'my-event');

    expect(result).toBe(false);
  });

  it('ignores paid orders with only canceled positions', async () => {
    process.env.PRETIX_REQUIRE_VALID_TICKET = 'true';
    process.env.PRETIX_API_TOKEN = 'token';
    process.env.PRETIX_ORGANIZER = 'org';
    process.env.PRETIX_API_BASE_URL = 'https://tickets.example.org';

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        count: 1,
        results: [{ status: 'p', testmode: false, positions: [{ canceled: true }] }]
      })
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await hasValidPretixTicketForEvent('person@example.org', 'my-event');

    expect(result).toBe(false);
  });

  it('ignores orders where attendee email does not match checked user', async () => {
    process.env.PRETIX_REQUIRE_VALID_TICKET = 'true';
    process.env.PRETIX_API_TOKEN = 'token';
    process.env.PRETIX_ORGANIZER = 'org';
    process.env.PRETIX_API_BASE_URL = 'https://tickets.example.org';

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        count: 1,
        results: [
          {
            status: 'p',
            testmode: false,
            positions: [{ canceled: false, attendee_email: 'other@example.org' }]
          }
        ]
      })
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await hasValidPretixTicketForEvent('person@example.org', 'my-event');

    expect(result).toBe(false);
  });

  it('ignores orders when attendee email is missing on active positions', async () => {
    process.env.PRETIX_REQUIRE_VALID_TICKET = 'true';
    process.env.PRETIX_API_TOKEN = 'token';
    process.env.PRETIX_ORGANIZER = 'org';
    process.env.PRETIX_API_BASE_URL = 'https://tickets.example.org';

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        count: 1,
        results: [
          {
            status: 'p',
            testmode: false,
            positions: [{ canceled: false }]
          }
        ]
      })
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await hasValidPretixTicketForEvent('person@example.org', 'my-event');

    expect(result).toBe(false);
  });

  it('requires matching item id when PRETIX_REQUIRED_ITEM_IDS is set', async () => {
    process.env.PRETIX_REQUIRE_VALID_TICKET = 'true';
    process.env.PRETIX_API_TOKEN = 'token';
    process.env.PRETIX_ORGANIZER = 'org';
    process.env.PRETIX_API_BASE_URL = 'https://tickets.example.org';
    process.env.PRETIX_REQUIRED_ITEM_IDS = '42';

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        count: 1,
        results: [
          {
            status: 'p',
            testmode: false,
            positions: [{ canceled: false, item: 7, attendee_email: 'person@example.org' }]
          }
        ]
      })
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await hasValidPretixTicketForEvent('person@example.org', 'my-event');

    expect(result).toBe(false);
  });

  it('passes when required item id and attendee email both match', async () => {
    process.env.PRETIX_REQUIRE_VALID_TICKET = 'true';
    process.env.PRETIX_API_TOKEN = 'token';
    process.env.PRETIX_ORGANIZER = 'org';
    process.env.PRETIX_API_BASE_URL = 'https://tickets.example.org';
    process.env.PRETIX_REQUIRED_ITEM_IDS = '42';

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        count: 1,
        results: [
          {
            status: 'p',
            testmode: false,
            positions: [{ canceled: false, item: 42, attendee_email: 'person@example.org' }]
          }
        ]
      })
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await hasValidPretixTicketForEvent('person@example.org', 'my-event');

    expect(result).toBe(true);
  });

  it('returns unique attendees across paginated paid orders', async () => {
    process.env.PRETIX_API_TOKEN = 'token';
    process.env.PRETIX_ORGANIZER = 'org';
    process.env.PRETIX_API_BASE_URL = 'https://tickets.example.org';

    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              status: 'p',
              testmode: false,
              positions: [
                {
                  canceled: false,
                  attendee_email: 'person@example.org',
                  attendee_name: 'Person One'
                }
              ]
            }
          ],
          next: 'https://tickets.example.org/api/v1/organizers/org/events/my-event/orders/?page=2'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              status: 'p',
              testmode: false,
              positions: [
                {
                  canceled: false,
                  attendee_email: 'person@example.org'
                },
                {
                  canceled: false,
                  attendee_email: 'other@example.org',
                  attendee_name: 'Other Person'
                }
              ]
            }
          ],
          next: null
        })
      });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getPretixAttendeesForEvent('my-event');

    expect(result).toEqual([
      { email: 'person@example.org', name: 'Person One' },
      { email: 'other@example.org', name: 'Other Person' }
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('filters attendees by PRETIX_REQUIRED_ITEM_IDS when configured', async () => {
    process.env.PRETIX_API_TOKEN = 'token';
    process.env.PRETIX_ORGANIZER = 'org';
    process.env.PRETIX_API_BASE_URL = 'https://tickets.example.org';
    process.env.PRETIX_REQUIRED_ITEM_IDS = '42';

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            status: 'p',
            testmode: false,
            positions: [
              { canceled: false, item: 7, attendee_email: 'skip@example.org' },
              { canceled: false, item: 42, attendee_email: 'keep@example.org' }
            ]
          }
        ],
        next: null
      })
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await getPretixAttendeesForEvent('my-event');

    expect(result).toEqual([{ email: 'keep@example.org', name: undefined }]);
  });
});
