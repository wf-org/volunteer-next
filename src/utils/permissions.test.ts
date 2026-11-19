import {
  getPermissionsProfile,
  canAccess,
  canSignupForShift,
  canCancelShiftSignup,
  canViewShift,
  filterVisibleShifts
} from './permissions';
import { hasShiftStarted, hasShiftEnded } from './date';

jest.mock('@/utils/date', () => ({
  hasShiftEnded: jest.fn(),
  hasShiftStarted: jest.fn()
}));

const mockHasShiftEnded = hasShiftEnded as jest.MockedFunction<typeof hasShiftEnded>;
const mockHasShiftStarted = hasShiftStarted as jest.MockedFunction<typeof hasShiftStarted>;

describe('getPermissionsProfile', () => {
  it('should return a profile with all permissions set to false for null user', () => {
    const profile = getPermissionsProfile(null);
    expect(profile).toEqual({
      userId: '',
      admin: false,
      organiser: false,
      'team-lead': false
    });
  });

  it('should return a profile with correct permissions for a user with roles', () => {
    const user: User = {
      id: '1',
      roles: [{ type: 'admin' }, { type: 'organiser', eventId: 'event' }],
      name: '',
      chosenName: '',
      email: ''
    };
    const profile = getPermissionsProfile(user);
    expect(profile).toEqual({
      userId: '1',
      admin: true,
      organiser: true,
      'team-lead': false
    });
  });
});

describe('canAccess', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it('should deny access if no permissions are defined for the property', () => {
    const profile = { admin: false, organiser: false, 'team-lead': false, userId: '1' };
    jest.spyOn(console, 'warn').mockImplementation(() => {}); // Suppress console warnings in test output
    const result = canAccess('VolunteerInfo', 'nonExistentProperty' as any, profile);
    expect(result).toBe(false);
  });

  it('should allow access if the property is accessible to volunteers', () => {
    const profile = { admin: false, organiser: false, 'team-lead': false, userId: '1' };
    const result = canAccess('VolunteerInfo', 'roles', profile);
    expect(result).toBe(true);
  });

  it('should allow access if the user has a required role', () => {
    const profile = { admin: true, organiser: false, 'team-lead': false, userId: '1' };
    const result = canAccess('VolunteerInfo', 'email', profile);
    expect(result).toBe(true);
  });

  it('should deny access if the user does not have a required role', () => {
    const profile = { admin: false, organiser: false, 'team-lead': false, userId: '1' };
    const result = canAccess('VolunteerInfo', 'email', profile);
    expect(result).toBe(false);
  });
});

describe('canSignupForShift', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return true if the shift has not ended', () => {
    const event = {};
    const shift = {};
    mockHasShiftEnded.mockReturnValue(false);
    const result = canSignupForShift(event as any, shift as any);
    expect(result).toBe(true);
  });

  it('should return false if the shift has ended', () => {
    const event = {};
    const shift = {};
    mockHasShiftEnded.mockReturnValue(true);
    const result = canSignupForShift(event as any, shift as any);
    expect(result).toBe(false);
  });
});

describe('canCancelShiftSignup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return true if the shift has not started', () => {
    const event = {};
    const shift = {};
    mockHasShiftStarted.mockReturnValue(false);
    const result = canCancelShiftSignup(event as any, shift as any);
    expect(result).toBe(true);
  });

  it('should return false if the shift has started', () => {
    const event = {};
    const shift = {};
    mockHasShiftStarted.mockReturnValue(true);
    const result = canCancelShiftSignup(event as any, shift as any);
    expect(result).toBe(false);
  });
});

describe('canViewShift', () => {
  const event = { id: 'e1' } as EventInfo;
  const shift = (isActive: boolean) => ({ id: 's1', teamId: 't1', isActive }) as ShiftInfo;
  const user = (roles: UserRole[]) => ({ id: 'u1', roles }) as User;

  it('shows active shifts to everyone', () => {
    expect(canViewShift(null, event, shift(true))).toBe(true);
    expect(canViewShift(user([]), event, shift(true))).toBe(true);
  });

  it('hides inactive shifts from volunteers and unrelated leads', () => {
    expect(canViewShift(null, event, shift(false))).toBe(false);
    expect(canViewShift(user([]), event, shift(false))).toBe(false);
    expect(
      canViewShift(user([{ type: 'team-lead', eventId: 'e1', teamId: 't2' }]), event, shift(false))
    ).toBe(false);
    expect(canViewShift(user([{ type: 'organiser', eventId: 'e2' }]), event, shift(false))).toBe(
      false
    );
  });

  it('shows inactive shifts to admins, event organisers and the team lead', () => {
    expect(canViewShift(user([{ type: 'admin' }]), event, shift(false))).toBe(true);
    expect(canViewShift(user([{ type: 'organiser', eventId: 'e1' }]), event, shift(false))).toBe(
      true
    );
    expect(
      canViewShift(user([{ type: 'team-lead', eventId: 'e1', teamId: 't1' }]), event, shift(false))
    ).toBe(true);
  });

  it('filters lists', () => {
    expect(filterVisibleShifts(user([]), event, [shift(true), shift(false)])).toHaveLength(1);
  });
});
