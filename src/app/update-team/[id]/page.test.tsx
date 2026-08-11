import { render } from '@testing-library/react';
import UpdateTeam from './page';
import TeamForm from '@/ui/team-form';
import { notFound, redirect } from 'next/navigation';
import { addRoleToUsers, getUsersWithRole, removeRoleFromUsers } from '@/service/user-service';
import { checkAuthorisation, currentUser, getCurrentEventOrRedirect } from '@/session';
import { inTransaction } from '@/db';
import { deleteTeam, getTeamById, updateTeam } from '@/service/team-service';
import { usersToVolunteers } from '@/lib/volunteer';
import { getPermissionsProfile } from '@/utils/permissions';
import { getCallbackUrl } from '@/utils/path';

jest.mock('@/i18n/metadata', () => jest.fn(() => jest.fn()));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn().mockResolvedValue((key: string) => key)
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: jest.fn(),
  unauthorized: jest.fn(() => {
    throw new Error('UNAUTHORIZED');
  })
}));

jest.mock('@/service/user-service', () => ({
  addRoleToUsers: jest.fn(),
  getUsersWithRole: jest.fn(),
  removeRoleFromUsers: jest.fn()
}));

jest.mock('@/session', () => ({
  checkAuthorisation: jest.fn(),
  currentUser: jest.fn().mockResolvedValue({ id: 'lead-user' }),
  getCurrentEventOrRedirect: jest.fn()
}));

jest.mock('@/db', () => ({
  inTransaction: jest.fn()
}));

jest.mock('@/service/team-service', () => ({
  deleteTeam: jest.fn(),
  getTeamById: jest.fn(),
  updateTeam: jest.fn()
}));

jest.mock('@/lib/volunteer', () => ({
  usersToVolunteers: jest.fn(() => [])
}));

jest.mock('@/utils/permissions', () => ({
  getPermissionsProfile: jest.fn(() => ({
    userId: 'lead-user',
    admin: false,
    organiser: false,
    'team-lead': true
  }))
}));

jest.mock('@/utils/path', () => ({
  getCallbackUrl: jest.fn(() => '/teams/callback'),
  getTeamsPath: jest.fn(() => '/teams')
}));

jest.mock('@/utils/date', () => ({
  hasEventStarted: jest.fn().mockReturnValue(false)
}));

jest.mock('@/ui/team-form', () => jest.fn(() => null));

const mockTeamForm = TeamForm as jest.MockedFunction<typeof TeamForm>;
const mockNotFound = notFound as jest.MockedFunction<typeof notFound>;
const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;
const mockAddRoleToUsers = addRoleToUsers as jest.MockedFunction<typeof addRoleToUsers>;
const mockGetUsersWithRole = getUsersWithRole as jest.MockedFunction<typeof getUsersWithRole>;
const mockRemoveRoleFromUsers = removeRoleFromUsers as jest.MockedFunction<typeof removeRoleFromUsers>;
const mockCheckAuthorisation = checkAuthorisation as jest.MockedFunction<typeof checkAuthorisation>;
const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;
const mockGetCurrentEventOrRedirect =
  getCurrentEventOrRedirect as jest.MockedFunction<typeof getCurrentEventOrRedirect>;
const mockInTransaction = inTransaction as jest.MockedFunction<typeof inTransaction>;
const mockDeleteTeam = deleteTeam as jest.MockedFunction<typeof deleteTeam>;
const mockGetTeamById = getTeamById as jest.MockedFunction<typeof getTeamById>;
const mockUpdateTeam = updateTeam as jest.MockedFunction<typeof updateTeam>;
const mockUsersToVolunteers = usersToVolunteers as jest.MockedFunction<typeof usersToVolunteers>;
const mockGetPermissionsProfile =
  getPermissionsProfile as jest.MockedFunction<typeof getPermissionsProfile>;
const mockGetCallbackUrl = getCallbackUrl as jest.MockedFunction<typeof getCallbackUrl>;

describe('UpdateTeam page', () => {
  const previousRequireTeamLead = process.env.REQUIRE_TEAM_LEAD;
  const mockEvent: EventInfo = {
    id: 'event-1',
    name: 'Test Event',
    slug: 'test-event',
    startDate: new Date('2026-08-01T10:00:00.000Z'),
    endDate: new Date('2026-08-02T20:00:00.000Z')
  };

  const mockTeam: TeamInfo = {
    id: 'team-1',
    eventId: mockEvent.id,
    name: 'Ops Team',
    slug: 'ops-team',
    description: 'Operations',
    contactAddress: 'team@example.com'
  };

  const props = {
    params: Promise.resolve({ id: mockTeam.id }),
    searchParams: Promise.resolve({})
  } as PageProps<'/update-team/[id]'>;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.REQUIRE_TEAM_LEAD;
    mockGetCurrentEventOrRedirect.mockResolvedValue(mockEvent);
    mockGetTeamById.mockResolvedValue(mockTeam);
    mockGetUsersWithRole.mockResolvedValue([{ id: 'lead-user' }] as User[]);
    mockUsersToVolunteers.mockReturnValue([]);
    mockCheckAuthorisation.mockImplementation(async (_roles, allowFalse?: boolean) => {
      return allowFalse ? false : true;
    });
    mockInTransaction.mockImplementation(async (transactionFn) => {
      await transactionFn({} as any);
      return undefined;
    });
  });

  afterAll(() => {
    if (previousRequireTeamLead === undefined) {
      delete process.env.REQUIRE_TEAM_LEAD;
    } else {
      process.env.REQUIRE_TEAM_LEAD = previousRequireTeamLead;
    }
  });

  it('update succeeds when removing the last team lead when REQUIRE_TEAM_LEAD is false', async () => {
    process.env.REQUIRE_TEAM_LEAD = 'false';

    render(await UpdateTeam(props));

    expect(mockTeamForm).toHaveBeenCalledTimes(1);
    const onSubmit = mockTeamForm.mock.calls[0][0].onSubmit;

    const data = new FormData();
    data.set('id', mockTeam.id);
    data.set('eventId', mockEvent.id);
    data.set('name', 'Ops Team Updated');
    data.set('slug', 'ops-team');
    data.set('description', 'Operations updated');
    data.set('contactAddress', 'team@example.com');

    await onSubmit(data);

    expect(mockUpdateTeam).toHaveBeenCalledTimes(1);
    expect(mockRemoveRoleFromUsers).toHaveBeenCalledWith(
      { type: 'team-lead', eventId: mockEvent.id, teamId: mockTeam.id },
      ['lead-user'],
      expect.any(Object)
    );
    expect(mockAddRoleToUsers).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith('/teams/callback');
  });

  it('update fails with zero team leads when REQUIRE_TEAM_LEAD is true', async () => {
    process.env.REQUIRE_TEAM_LEAD = 'true';

    render(await UpdateTeam(props));
    const onSubmit = mockTeamForm.mock.calls[0][0].onSubmit;

    const data = new FormData();
    data.set('id', mockTeam.id);
    data.set('eventId', mockEvent.id);
    data.set('name', 'Ops Team Updated');
    data.set('slug', 'ops-team');
    data.set('description', 'Operations updated');
    data.set('contactAddress', 'team@example.com');

    await expect(onSubmit(data)).rejects.toThrow('At least one team lead is required');
    expect(mockUpdateTeam).not.toHaveBeenCalled();
    expect(mockRemoveRoleFromUsers).not.toHaveBeenCalled();
  });

  it('permissions after zero-lead update are intentional: former lead loses access', async () => {
    process.env.REQUIRE_TEAM_LEAD = 'false';

    let hasTeamLeadAccess = true;

    mockCheckAuthorisation.mockImplementation(async (roles, allowFalse) => {
      const permitted =
        roles?.some((role) => role.type === 'team-lead' && hasTeamLeadAccess) || false;

      if (allowFalse) {
        return permitted;
      }
      if (!permitted) {
        throw new Error('UNAUTHORIZED');
      }
      return true;
    });

    mockRemoveRoleFromUsers.mockImplementation(async (_role, userIds) => {
      if (userIds.includes('lead-user')) {
        hasTeamLeadAccess = false;
      }
    });

    render(await UpdateTeam(props));
    const onSubmit = mockTeamForm.mock.calls[0][0].onSubmit;

    const data = new FormData();
    data.set('id', mockTeam.id);
    data.set('eventId', mockEvent.id);
    data.set('name', mockTeam.name);
    data.set('slug', mockTeam.slug);
    data.set('description', mockTeam.description);
    data.set('contactAddress', mockTeam.contactAddress);

    await onSubmit(data);

    await expect(UpdateTeam(props)).rejects.toThrow('UNAUTHORIZED');
    expect(mockRemoveRoleFromUsers).toHaveBeenCalledWith(
      { type: 'team-lead', eventId: mockEvent.id, teamId: mockTeam.id },
      ['lead-user'],
      expect.any(Object)
    );
  });

  it('guards against mismatched team identity in submit payload', async () => {
    render(await UpdateTeam(props));
    const onSubmit = mockTeamForm.mock.calls[0][0].onSubmit;

    const data = new FormData();
    data.set('id', 'other-team');
    data.set('eventId', mockEvent.id);
    data.set('name', mockTeam.name);
    data.set('slug', mockTeam.slug);
    data.set('description', mockTeam.description);
    data.set('contactAddress', mockTeam.contactAddress);

    await expect(onSubmit(data)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalled();
    expect(mockUpdateTeam).not.toHaveBeenCalled();
  });

  it('renders with expected dependency wiring', async () => {
    render(await UpdateTeam(props));

    expect(mockCurrentUser).toHaveBeenCalled();
    expect(mockGetPermissionsProfile).toHaveBeenCalled();
    expect(mockGetUsersWithRole).toHaveBeenCalled();
    expect(mockDeleteTeam).not.toHaveBeenCalled();
    expect(mockGetCallbackUrl).toHaveBeenCalled();
  });
});
