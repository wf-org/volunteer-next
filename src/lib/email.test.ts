import { sendUserShiftEmail, getNotifyVolunteersAction } from './email';
import { sendEmailWithTemplate } from '@/email/template';
import { startMailer } from '@/email/mailer';

jest.mock('@/email/template', () => ({
  sendEmailWithTemplate: jest.fn().mockResolvedValue({ status: 'sent' })
}));

jest.mock('@/email/mailer', () => ({
  startMailer: jest.fn()
}));

jest.mock('@/session', () => ({
  checkAuthorisation: jest.fn().mockResolvedValue(true)
}));

const mockSendEmailWithTemplate = sendEmailWithTemplate as jest.MockedFunction<
  typeof sendEmailWithTemplate
>;

describe('sendUserShiftEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call sendEmailWithTemplate with correct parameters', async () => {
    const event = { slug: 'event-slug' } as EventInfo;
    const user = { id: 'user-id', email: 'user@example.com', chosenName: 'John' } as User;
    const shifts = [{ eventDay: 1, startTime: '10:00' }] as ShiftInfo[];
    const teams = [{ id: 'team-id' }] as TeamInfo[];

    await sendUserShiftEmail({ event, user, shifts, teams });

    expect(mockSendEmailWithTemplate).toHaveBeenCalledWith({
      key: 'ShiftEmail:event-slug:user-id',
      to: 'user@example.com',
      template: 'ShiftEmail',
      props: {
        name: 'John',
        event,
        shifts,
        teams
      }
    });
  });
});

describe('getNotifyVolunteersAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('should send emails to volunteers with correct parameters', async () => {
    const volunteers = [
      { id: 'volunteer-1', email: 'volunteer1@example.com' },
      { id: 'volunteer-2', email: 'volunteer2@example.com' }
    ] as VolunteerInfo[];
    const shiftsByVolunteerId = {
      'volunteer-1': [{ eventDay: 1, startTime: '09:00' }] as ShiftInfo[],
      'volunteer-2': [{ eventDay: 2, startTime: '10:00' }] as ShiftInfo[]
    };
    const event = { slug: 'event-slug' } as EventInfo;
    const teams = [{ id: 'team-id' }] as TeamInfo[];
    const emailCustomisation = {
      subject: 'Test Subject',
      body: 'Test Body',
      includeShifts: true
    };

    const notifyVolunteersAction = getNotifyVolunteersAction({
      volunteers,
      shiftsByVolunteerId,
      event,
      teams,
      acceptedRoles: []
    });

    await notifyVolunteersAction(emailCustomisation);

    expect(mockSendEmailWithTemplate).toHaveBeenCalledTimes(2);
    expect(mockSendEmailWithTemplate).toHaveBeenCalledWith({
      to: 'volunteer1@example.com',
      template: 'NotifyEmail',
      startMailer: false,
      props: {
        subject: 'Test Subject',
        body: 'Test Body',
        event,
        shifts: [{ eventDay: 1, startTime: '09:00' }],
        teams
      }
    });
    expect(mockSendEmailWithTemplate).toHaveBeenCalledWith({
      to: 'volunteer2@example.com',
      template: 'NotifyEmail',
      startMailer: false,
      props: {
        subject: 'Test Subject',
        body: 'Test Body',
        event,
        shifts: [{ eventDay: 2, startTime: '10:00' }],
        teams
      }
    });
  });

  it('should skip volunteers without email addresses', async () => {
    const volunteers = [
      { id: 'volunteer-1', email: 'volunteer1@example.com' },
      { id: 'volunteer-2', email: null }
    ] as VolunteerInfo[];
    const shiftsByVolunteerId = {
      'volunteer-1': [{ eventDay: 1, startTime: '09:00' }] as ShiftInfo[]
    };
    const event = { slug: 'event-slug' } as EventInfo;
    const teams = [{ id: 'team-id' }] as TeamInfo[];
    const emailCustomisation = {
      subject: 'Test Subject',
      body: 'Test Body',
      includeShifts: false
    };

    const { getNotifyVolunteersAction } = await import('./email');
    const notifyVolunteersAction = getNotifyVolunteersAction({
      volunteers,
      shiftsByVolunteerId,
      event,
      teams,
      acceptedRoles: []
    });

    await notifyVolunteersAction(emailCustomisation);

    expect(mockSendEmailWithTemplate).toHaveBeenCalledTimes(1);
    expect(mockSendEmailWithTemplate).toHaveBeenCalledWith({
      to: 'volunteer1@example.com',
      template: 'NotifyEmail',
      startMailer: false,
      props: {
        subject: 'Test Subject',
        body: 'Test Body'
      }
    });
  });

  it('should start the mailer once after queueing all emails', async () => {
    mockSendEmailWithTemplate.mockResolvedValue({ status: 'queued' });
    const volunteers = [
      { id: 'volunteer-1', email: 'volunteer1@example.com' },
      { id: 'volunteer-2', email: 'volunteer2@example.com' }
    ] as VolunteerInfo[];

    const { getNotifyVolunteersAction } = await import('./email');
    const result = await getNotifyVolunteersAction({
      volunteers,
      shiftsByVolunteerId: {},
      event: { slug: 'event-slug' } as EventInfo,
      teams: [],
      acceptedRoles: []
    })({ subject: 'Test Subject', body: 'Test Body', includeShifts: false });

    expect(result).toEqual({ status: 'queued' });
    expect(mockSendEmailWithTemplate).toHaveBeenCalledTimes(2);
    expect(startMailer).toHaveBeenCalledTimes(1);
  });

  it('should not start the mailer when emails were sent directly', async () => {
    mockSendEmailWithTemplate.mockResolvedValue({ status: 'sent' });

    const { getNotifyVolunteersAction } = await import('./email');
    await getNotifyVolunteersAction({
      volunteers: [{ id: 'volunteer-1', email: 'volunteer1@example.com' }] as VolunteerInfo[],
      shiftsByVolunteerId: {},
      event: { slug: 'event-slug' } as EventInfo,
      teams: [],
      acceptedRoles: []
    })({ subject: 'Test Subject', body: 'Test Body', includeShifts: false });

    expect(startMailer).not.toHaveBeenCalled();
  });
});
