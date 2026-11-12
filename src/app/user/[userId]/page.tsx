import metadata from '@/i18n/metadata';
import {
  assignQualificationToUsers,
  getQualificationById,
  getQualificationsForEvent,
  getQualificationsForUser,
  removeQualificationFromUser
} from '@/service/qualification-service';
import { getTeamsById, getTeamsForEvent } from '@/service/team-service';
import { getUser, getVolunteersForShifts } from '@/service/user-service';
import {
  addVolunteerToShift,
  getShiftById,
  getShiftLock,
  getShiftSignupCount,
  getShiftsForEvent,
  getShiftsForVolunteer,
  removeVolunteerFromShift
} from '@/service/shift-service';
import { inTransaction } from '@/db';
import ShiftOverviewList from '@/ui/shift-overview-list';
import { sendUserShiftEmail } from '@/lib/email';
import { eventDayToDate, to12HourTimeString } from '@/utils/datetime';
import { checkAuthorisation, currentUser, getCurrentEvent, getMatchingRoles } from '@/session';
import UserQualifications from '@/ui/user-qualifications';
import VolunteerCard from '@/ui/volunteer-card';
import { getEditUserPath, getUserProfilePath } from '@/utils/path';
import { Box, Button, Flex, Heading, IconButton, Select, Text } from '@radix-ui/themes';
import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';
import { notFound, redirect, unauthorized } from 'next/navigation';
import { getManagedQualifications } from '@/lib/qualification';
import { FormField } from '@/ui/form-dialog';
import { ExitIcon, Pencil2Icon, PlusIcon } from '@radix-ui/react-icons';
import { getVolunteerById } from '@/lib/volunteer';
import { canSignupForShift, getPermissionsProfile } from '@/utils/permissions';
import { signOut } from '@/auth';
import { headers } from 'next/headers';
import NextLink from 'next/link';
import { hasEventEnded } from '@/utils/date';

const PAGE_KEY = 'VolunteerProfilePage';

export const generateMetadata = metadata(PAGE_KEY, {
  title: async (params) => {
    const { userId } = params;
    const t = await getTranslations(PAGE_KEY);
    const permissionsProfile = getPermissionsProfile(await currentUser());
    const event = await getCurrentEvent();
    const user = await getVolunteerById(userId ?? null, event?.id ?? null, permissionsProfile);
    return t('title', {
      name: user?.displayName ?? ''
    });
  }
});

export default async function VolunteerProfilePage({ params }: PageProps<'/user/[userId]'>) {
  const { userId } = await params;
  const t = await getTranslations(PAGE_KEY);
  const permissionsProfile = getPermissionsProfile(await currentUser());
  const event = await getCurrentEvent();

  const volunteer = await getVolunteerById(userId, event?.id ?? null, permissionsProfile);
  if (!volunteer) {
    notFound();
  }

  const isAdmin = await checkAuthorisation([{ type: 'admin' }], true);
  const isOwnProfile = volunteer.id === permissionsProfile.userId;
  const organisesEvent =
    event !== null && (await checkAuthorisation([{ type: 'organiser', eventId: event.id }], true));
  const leadsTeamIds = event
    ? await getMatchingRoles({ type: 'team-lead', eventId: event.id }).then((roles) =>
        roles.filter((role) => role.type === 'team-lead').map((role) => role.teamId)
      )
    : [];
  const leadsTeams = await getTeamsById(leadsTeamIds);

  const canManageQualifications =
    event && !hasEventEnded(event) && (isAdmin || organisesEvent || leadsTeams.length > 0);
  const managedQualifications = canManageQualifications
    ? await getManagedQualifications({
        event,
        isAdmin,
        organisesEvent,
        leadsTeams: leadsTeamIds
      })
    : [];
  const managedQualificationIds = new Set(
    managedQualifications.map((qualification) => qualification.id)
  );

  const qualifications = event ? await getQualificationsForUser(userId, event.id) : [];

  const omitQualificationOptions = new Set(qualifications.map((qualification) => qualification.id));
  const qualificationOptions = managedQualifications.filter(
    (qualification) => !omitQualificationOptions.has(qualification.id)
  );
  const teams = event ? await getTeamsForEvent(event.id) : [];

  // Shift assignment (admins only, for the current event)
  const canManageShifts = isAdmin && event !== null;
  const volunteerShifts = canManageShifts ? await getShiftsForVolunteer(event.id, userId) : [];
  const eventShifts = canManageShifts ? await getShiftsForEvent(event.id) : [];
  const shiftVolunteers = canManageShifts
    ? await getVolunteersForShifts(
        eventShifts.map((shift) => shift.id),
        permissionsProfile,
        event.id
      )
    : {};
  const shiftQualifications = canManageShifts ? await getQualificationsForEvent(event.id) : [];
  const assignedShiftIds = new Set(volunteerShifts.map((shift) => shift.id));
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const shiftOptions = canManageShifts
    ? eventShifts
        .filter(
          (shift) =>
            shift.isActive &&
            !assignedShiftIds.has(shift.id) &&
            canSignupForShift(event, shift) &&
            (shiftVolunteers[shift.id]?.length ?? 0) < shift.maxVolunteers
        )
        .map((shift) => {
          const day = eventDayToDate(event.startDate, shift.eventDay).toLocaleDateString('en', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC'
          });
          const time =
            event.timeFormat === '12h' ? to12HourTimeString(shift.startTime) : shift.startTime;
          return {
            id: shift.id,
            label: `${teamNames.get(shift.teamId) ?? ''} · ${shift.title} · ${day} ${time}`
          };
        })
    : [];

  const onAssignShift = async (data: FormData) => {
    'use server';
    await checkAuthorisation([{ type: 'admin' }]);
    if (!event) {
      notFound();
    }
    const shiftId = data.get('shift-id');
    if (typeof shiftId !== 'string') {
      throw new Error('Invalid shift ID');
    }
    const shift = await getShiftById(shiftId);
    const team = shift ? (await getTeamsById([shift.teamId]))[0] : undefined;
    if (!shift || !team || team.eventId !== event.id) {
      throw new Error('Shift not found in the current event');
    }
    if (!canSignupForShift(event, shift)) {
      throw new Error('Shift has already ended');
    }
    if (shift.requirements.length > 0) {
      const userQualificationIds = new Set(
        (await getQualificationsForUser(userId, event.id)).map((qualification) => qualification.id)
      );
      if (!shift.requirements.every((id) => userQualificationIds.has(id))) {
        throw new Error('Volunteer does not have all required qualifications for this shift');
      }
    }
    await inTransaction(async (client) => {
      await getShiftLock(shiftId, client);
      if ((await getShiftSignupCount(shiftId, client)) >= shift.maxVolunteers) {
        throw new Error('Shift is already full');
      }
      await addVolunteerToShift(shiftId, userId, client);
    });

    // Same confirmation email the volunteer gets when signing up themselves
    const user = await getUser(userId);
    if (user) {
      const result = await sendUserShiftEmail({
        event,
        user,
        shifts: await getShiftsForVolunteer(event.id, userId),
        teams: await getTeamsForEvent(event.id)
      });
      if (result.status === 'failed') {
        console.error('Shift email failed for %s: %s', userId, result.error);
      }
    }
    revalidatePath(getUserProfilePath(userId));
  };

  const onRemoveShift = async (shiftId: ShiftId) => {
    'use server';
    await checkAuthorisation([{ type: 'admin' }]);
    await removeVolunteerFromShift(shiftId, userId);
    revalidatePath(getUserProfilePath(userId));
  };

  const authoriseForQualification = async (qualification: QualificationInfo) => {
    'use server';
    const authorisedRoles: UserRole[] = [
      {
        type: 'admin'
      },
      {
        type: 'organiser',
        eventId: qualification.eventId
      }
    ];
    if (qualification.teamId) {
      authorisedRoles.push({
        type: 'team-lead',
        teamId: qualification.teamId,
        eventId: qualification.eventId
      });
    }
    return checkAuthorisation(authorisedRoles, true);
  };

  const onAdd = async (data: FormData) => {
    'use server';
    const qualificationId = data.get('qualification-id');
    if (typeof qualificationId !== 'string') {
      throw new Error('Invalid qualification ID');
    }
    if (!managedQualificationIds.has(qualificationId) || (event && hasEventEnded(event))) {
      unauthorized();
    }
    const qualification = await getQualificationById(qualificationId);
    if (!qualification) {
      throw new Error('Qualification not found');
    }
    await authoriseForQualification(qualification);
    await assignQualificationToUsers(qualificationId, [userId]);
    revalidatePath(getUserProfilePath(userId));
  };

  const onRemove = async (qualificationId: QualificationId) => {
    'use server';
    if (!managedQualificationIds.has(qualificationId) || (event && hasEventEnded(event))) {
      unauthorized();
    }
    const qualification = await getQualificationById(qualificationId);
    if (!qualification) {
      throw new Error('Qualification not found');
    }
    await authoriseForQualification(qualification);
    await removeQualificationFromUser(qualificationId, userId);
    revalidatePath(getUserProfilePath(userId));
  };

  const signOutAction = async () => {
    'use server';
    const redirectUrl = await signOut(await headers());
    redirect(redirectUrl);
  };

  return (
    <Flex direction="column" gap="4" my="4">
      <VolunteerCard
        volunteer={volunteer}
        actions={
          (isOwnProfile || isAdmin) && (
            <IconButton asChild variant="ghost" aria-label={t('edit')} title={t('edit')}>
              <NextLink href={getEditUserPath(volunteer.id, getUserProfilePath(volunteer.id))}>
                <Pencil2Icon width={20} height={20} />
              </NextLink>
            </IconButton>
          )
        }
      />
      {isOwnProfile && (
        <Box mt="4">
          <Button
            variant="soft"
            color="red"
            onClick={signOutAction}
            data-umami-event="Sign out"
            data-umami-event-userid={volunteer.id}
          >
            <ExitIcon />
            {t('signOut')}
          </Button>
        </Box>
      )}
      {canManageShifts && (
        <>
          <Heading as="h2" size="4" mt="4">
            {t('shifts')}
          </Heading>
          {volunteerShifts.length === 0 ? (
            <Text color="gray">{t('noShifts')}</Text>
          ) : (
            <ShiftOverviewList
              event={event}
              teams={teams}
              shifts={volunteerShifts}
              shiftVolunteers={shiftVolunteers}
              qualifications={shiftQualifications}
              onCancelShift={onRemoveShift}
            />
          )}
          <Flex direction="column" gap="2" asChild>
            <form>
              <FormField
                ariaId="assign-shift"
                name={t('assignShiftLabel')}
                description={t('assignShiftDescription')}
              >
                <Select.Root
                  disabled={shiftOptions.length === 0}
                  key={volunteerShifts.length}
                  name="shift-id"
                  required
                >
                  <Select.Trigger placeholder={t('select')} aria-labelledby="assign-shift" />
                  <Select.Content>
                    {shiftOptions.map((option) => (
                      <Select.Item key={option.id} value={option.id}>
                        {option.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </FormField>
              <Button
                disabled={shiftOptions.length === 0}
                variant="soft"
                style={{ alignSelf: 'flex-start' }}
                formAction={onAssignShift}
              >
                <PlusIcon />
                {t('assignShift')}
              </Button>
            </form>
          </Flex>
        </>
      )}
      {event && (
        <>
          <Heading as="h2" size="4" mt="4">
            {t('qualifications')}
          </Heading>
          <UserQualifications
            qualifications={qualifications}
            event={event}
            teams={teams}
            onRemove={onRemove}
            managedQualificationIds={managedQualificationIds}
          />
          {canManageQualifications && (
            <Flex direction="column" gap="2" asChild>
              <form>
                <FormField
                  ariaId={'add-qualification'}
                  name={t('addQualification')}
                  description={t('addQualificationDescription')}
                >
                  <Select.Root
                    disabled={qualificationOptions.length === 0}
                    key={qualifications.length}
                    name="qualification-id"
                    required
                  >
                    <Select.Trigger placeholder={t('select')} aria-labelledby="add-qualification" />
                    <Select.Content>
                      {qualificationOptions.map((qualification) => (
                        <Select.Item key={qualification.id} value={qualification.id}>
                          {qualification.name}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </FormField>
                <Button
                  disabled={qualificationOptions.length === 0}
                  variant="soft"
                  style={{ alignSelf: 'flex-start' }}
                  formAction={onAdd}
                >
                  <PlusIcon />
                  {t('assignQualification')}
                </Button>
              </form>
            </Flex>
          )}
        </>
      )}
    </Flex>
  );
}
