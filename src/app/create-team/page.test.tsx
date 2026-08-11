import { render } from '@testing-library/react';
import CreateTeam from './page';
import TeamForm from '@/ui/team-form';
import { redirect } from 'next/navigation';
import { addRoleToUsers } from '@/service/user-service';
import { checkAuthorisation, getCurrentEventOrRedirect } from '@/session';
import { inTransaction } from '@/db';
import { createTeam } from '@/service/team-service';
import { getTeamsPath } from '@/utils/path';

jest.mock('@/i18n/metadata', () => jest.fn(() => jest.fn()));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn().mockResolvedValue((key: string) => key)
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  unauthorized: jest.fn(() => {
    throw new Error('UNAUTHORIZED');
  })
}));

jest.mock('@/service/user-service', () => ({
  addRoleToUsers: jest.fn()
}));

jest.mock('@/session', () => ({
  checkAuthorisation: jest.fn().mockResolvedValue(true),
  getCurrentEventOrRedirect: jest.fn()
}));

jest.mock('@/db', () => ({
  inTransaction: jest.fn()
}));

jest.mock('@/service/team-service', () => ({
  createTeam: jest.fn()
}));

jest.mock('@/utils/path', () => ({
  getTeamsPath: jest.fn(() => '/teams')
}));

jest.mock('@/utils/date', () => ({
  hasEventStarted: jest.fn().mockReturnValue(false)
}));

jest.mock('@/ui/team-form', () => jest.fn(() => null));

const mockTeamForm = TeamForm as jest.MockedFunction<typeof TeamForm>;
const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;
const mockAddRoleToUsers = addRoleToUsers as jest.MockedFunction<typeof addRoleToUsers>;
const mockCheckAuthorisation = checkAuthorisation as jest.MockedFunction<typeof checkAuthorisation>;
const mockGetCurrentEventOrRedirect =
  getCurrentEventOrRedirect as jest.MockedFunction<typeof getCurrentEventOrRedirect>;
const mockInTransaction = inTransaction as jest.MockedFunction<typeof inTransaction>;
const mockCreateTeam = createTeam as jest.MockedFunction<typeof createTeam>;
const mockGetTeamsPath = getTeamsPath as jest.MockedFunction<typeof getTeamsPath>;

describe('CreateTeam page', () => {
  const mockEvent: EventInfo = {
    id: 'event-1',
    name: 'Test Event',
    slug: 'test-event',
    startDate: new Date('2026-08-01T10:00:00.000Z'),
    endDate: new Date('2026-08-02T20:00:00.000Z')
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentEventOrRedirect.mockResolvedValue(mockEvent);
    mockCreateTeam.mockResolvedValue({
      id: 'team-1',
      eventId: mockEvent.id,
      name: 'Ops Team',
      slug: 'ops-team',
      description: 'Operations',
      contactAddress: 'team@example.com'
    });
    mockInTransaction.mockImplementation(async (transactionFn) => {
      await transactionFn({} as any);
      return undefined;
    });
  });

  it('create succeeds with zero team leads', async () => {
    render(await CreateTeam());

    expect(mockTeamForm).toHaveBeenCalledTimes(1);
    const onSubmit = mockTeamForm.mock.calls[0][0].onSubmit;

    const data = new FormData();
    data.set('eventId', mockEvent.id);
    data.set('name', 'Ops Team');
    data.set('slug', 'ops-team');
    data.set('description', 'Operations');
    data.set('contactAddress', 'team@example.com');

    await onSubmit(data);

    expect(mockCheckAuthorisation).toHaveBeenCalledWith([
      { type: 'admin' },
      { type: 'organiser', eventId: mockEvent.id }
    ]);
    expect(mockCreateTeam).toHaveBeenCalledTimes(1);
    expect(mockAddRoleToUsers).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith('/teams');
    expect(mockGetTeamsPath).toHaveBeenCalledTimes(1);
  });
});
