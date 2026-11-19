import { getPretalxSessions, slotToShiftTiming, slotsToSessions } from './pretalx';

const eventStart = new Date('2026-06-01T00:00:00Z');

describe('slotToShiftTiming', () => {
  it('uses the local wall-clock date and time from the slot', () => {
    expect(
      slotToShiftTiming(eventStart, '2026-06-02T23:30:00-07:00', '2026-06-03T00:15:00-07:00')
    ).toEqual({ eventDay: 1, startTime: '23:30', durationHours: 1 });
  });

  it('rounds duration up to whole hours', () => {
    expect(
      slotToShiftTiming(eventStart, '2026-06-01T10:00:00+02:00', '2026-06-01T11:30:00+02:00')
        .durationHours
    ).toBe(2);
  });

  it('rejects invalid times', () => {
    expect(() => slotToShiftTiming(eventStart, 'bad', '2026-06-01T11:00:00Z')).toThrow();
    expect(() =>
      slotToShiftTiming(eventStart, '2026-06-01T11:00:00Z', '2026-06-01T10:00:00Z')
    ).toThrow();
  });
});

describe('slotsToSessions', () => {
  const submission = {
    code: 'ABC123',
    title: ' My Talk ',
    abstract: 'About things',
    state: 'confirmed',
    track: { name: { en: 'Workshops' } },
    speakers: [{ code: 'S1', email: 'Speaker@Example.org' }, { code: 'S2', email: null }, 'S3']
  };

  it('keeps only confirmed, scheduled submissions', () => {
    const sessions = slotsToSessions([
      { id: 1, start: '2026-06-01T10:00:00Z', end: '2026-06-01T11:00:00Z', submission },
      { id: 2, start: '2026-06-01T12:00:00Z', end: '2026-06-01T13:00:00Z', submission: null },
      {
        id: 3,
        start: '2026-06-01T12:00:00Z',
        end: '2026-06-01T13:00:00Z',
        submission: { ...submission, code: 'XYZ', state: 'accepted' }
      },
      { id: 4, start: null, end: null, submission: { ...submission, code: 'NOSLOT' } },
      { id: 5, start: '2026-06-01T12:00:00Z', end: '2026-06-01T13:00:00Z', submission: 'CODE' }
    ]);

    expect(sessions).toEqual([
      {
        ref: 'ABC123#0',
        submissionCode: 'ABC123',
        title: 'My Talk',
        abstract: 'About things',
        track: 'Workshops',
        start: '2026-06-01T10:00:00Z',
        end: '2026-06-01T11:00:00Z',
        speakerEmails: ['speaker@example.org']
      }
    ]);
  });

  it('gives multi-slot submissions stable refs ordered by start', () => {
    const sessions = slotsToSessions([
      { id: 9, start: '2026-06-02T10:00:00Z', end: '2026-06-02T11:00:00Z', submission },
      { id: 8, start: '2026-06-01T10:00:00Z', end: '2026-06-01T11:00:00Z', submission }
    ]);
    expect(sessions.map((s) => [s.ref, s.start])).toEqual([
      ['ABC123#0', '2026-06-01T10:00:00Z'],
      ['ABC123#1', '2026-06-02T10:00:00Z']
    ]);
  });
});

describe('getPretalxSessions', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PRETALX_API_BASE_URL: 'https://pretalx.example.org/',
      PRETALX_API_TOKEN: 'token'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('throws when config is missing', async () => {
    delete process.env.PRETALX_API_TOKEN;
    await expect(getPretalxSessions('evt')).rejects.toThrow('incomplete');
  });

  it('follows pagination, sends auth headers, and matches speaker emails by code', async () => {
    const slot = {
      id: 1,
      start: '2026-06-01T10:00:00Z',
      end: '2026-06-01T11:00:00Z',
      submission: { code: 'ABC', title: 'Talk', state: 'confirmed', speakers: ['S1', 'S2'] }
    };
    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [], next: 'https://pretalx.example.org/next' })
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [slot], next: null }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            { code: 'S1', email: 'Teacher@Example.org' },
            { code: 'S2', email: null }
          ],
          next: null
        })
      });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const sessions = await getPretalxSessions('my-event');

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const [firstUrl, init] = fetchSpy.mock.calls[0];
    expect(firstUrl).toBe(
      'https://pretalx.example.org/api/events/my-event/slots/?expand=submission%2Csubmission.track'
    );
    expect(init.headers).toMatchObject({
      Authorization: 'Token token',
      'Pretalx-Version': 'v1'
    });
    expect(fetchSpy.mock.calls[1][0]).toBe('https://pretalx.example.org/next');
    expect(fetchSpy.mock.calls[2][0]).toBe(
      'https://pretalx.example.org/api/events/my-event/speakers/'
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].speakerEmails).toEqual(['teacher@example.org']);
  });

  it('throws on non-success responses', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 403 }) as unknown as typeof fetch;
    await expect(getPretalxSessions('evt')).rejects.toThrow('403');
  });
});
