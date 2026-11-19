import metadata from '@/i18n/metadata';
import { getNotifyVolunteersAction } from '@/lib/email';
import { getFilteredShiftsForEvent } from '@/service/shift-service';
import { getTeamsForEvent } from '@/service/team-service';
import { getVolunteersForShifts } from '@/service/user-service';
import {
  checkAuthorisation,
  currentUser,
  getCurrentEventOrRedirect,
  getMatchingRoles
} from '@/session';
import SendEmailButton from '@/ui/send-email-button';
import ShiftOverviewList from '@/ui/shift-overview-list';
import { deduplicateBy } from '@/utils/list';
import {
  getEventShiftsApiPath,
  getEventShiftsPath,
  getImportPretalxApiPath
} from '@/utils/path';
import { getPermissionsProfile } from '@/utils/permissions';
import { Share2Icon, EnvelopeClosedIcon } from '@radix-ui/react-icons';
import { Button, Card, Flex, Heading, Text } from '@radix-ui/themes';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getQualificationsForEvent } from '@/service/qualification-service';
import { hasEventStarted } from '@/utils/date';
import AddShiftButton from '@/ui/add-shift-button';
import { getDeleteShiftAction, getSaveShiftAction } from '@/lib/shifts';
import { recordToShiftFilters } from '@/utils/shift-filters';
import ShiftFilters from '@/ui/shift-filters';
import ImportPretalxButton from '@/ui/import-pretalx-button';
import { isPretalxConfigured } from '@/lib/pretalx';

const PAGE_KEY = 'EventShiftsPage';

export const generateMetadata = metadata(PAGE_KEY);

export default async function EventShifts({ searchParams }: PageProps<`/shifts`>) {
  const event = await getCurrentEventOrRedirect();
  if (!event) {
    notFound();
  }

  const eventRoles: UserRoleMatchCriteria[] = [
    { type: 'admin' },
    { type: 'organiser', eventId: event.id }
  ];
  const hasEventAccess = await checkAuthorisation(eventRoles, true);

  const t = await getTranslations(PAGE_KEY);
  const resolvedSearchParams = await searchParams;
  const filters = recordToShiftFilters(resolvedSearchParams);
  const getParam = (key: string): string | undefined => {
    const value = resolvedSearchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const pretalxImport = getParam('pretalxImport');
  const pretalxCounts = Object.fromEntries(
    [
      'sessionCount',
      'createdCount',
      'updatedCount',
      'assignedCount',
      'unmatchedSpeakerCount',
      'skippedCount',
      'notInScheduleCount'
    ].map((key) => [key, Number(getParam(key) ?? 0)])
  );
  const hasPretalxWarnings =
    pretalxCounts.unmatchedSpeakerCount +
      pretalxCounts.skippedCount +
      pretalxCounts.notInScheduleCount >
    0;
  const shifts = await getFilteredShiftsForEvent(event.id, filters);
  const shiftMap = Object.fromEntries(shifts.map((shift) => [shift.id, shift]));
  const shiftVolunteers = await getVolunteersForShifts(
    Object.keys(shiftMap),
    getPermissionsProfile(await currentUser()),
    event.id
  );
  const shiftsByVolunteerId = Object.entries(shiftVolunteers).reduce<Record<UserId, ShiftInfo[]>>(
    (acc, [shiftId, volunteers]) => {
      for (const volunteer of volunteers) {
        if (!acc[volunteer.id]) {
          acc[volunteer.id] = [];
        }
        acc[volunteer.id].push(shiftMap[shiftId]);
      }
      return acc;
    },
    {}
  );

  const teams = await getTeamsForEvent(event.id);
  const leadTeamsIds = (await getMatchingRoles({ type: 'team-lead', eventId: event.id })).map(
    (role) => (role as TeamLeadRole).teamId
  );
  const leadTeamsIdsSet = new Set(leadTeamsIds);
  const isEditable = !hasEventStarted(event) && (hasEventAccess || leadTeamsIds.length > 0);

  const managedTeams = hasEventAccess
    ? teams
    : teams.filter((team) => leadTeamsIdsSet.has(team.id));

  const qualifications = await getQualificationsForEvent(event.id);
  const emailableVolunteers = deduplicateBy(
    Object.values(shiftVolunteers).flat(),
    ({ id }) => id
  ).filter((v) => v.email);

  const doNotify = getNotifyVolunteersAction({
    volunteers: emailableVolunteers,
    shiftsByVolunteerId,
    event,
    teams,
    acceptedRoles: eventRoles
  });

  const onSaveShift = getSaveShiftAction({
    isEditable,
    event,
    redirectUri: getEventShiftsPath()
  });

  const onDeleteShift = getDeleteShiftAction({
    isEditable,
    event,
    redirectUri: getEventShiftsPath()
  });

  return (
    <Flex direction="column" gap="6" py="4">
      <Heading align="center" as="h1" size="6">
        {t('allShifts')}
      </Heading>
      {pretalxImport === 'success' && (
        <Card
          style={
            {
              '--card-background-color': 'var(--green-3)',
              borderColor: 'var(--green-8)'
            } as React.CSSProperties
          }
        >
          <Flex direction="column" gap="1">
            <Text weight="bold">{t('importPretalxSuccessTitle')}</Text>
            <Text>{t('importPretalxSuccessMessage', pretalxCounts)}</Text>
            {hasPretalxWarnings && <Text>{t('importPretalxWarnings', pretalxCounts)}</Text>}
          </Flex>
        </Card>
      )}
      {pretalxImport === 'failure' && (
        <Card
          style={
            {
              '--card-background-color': 'var(--red-3)',
              borderColor: 'var(--red-8)'
            } as React.CSSProperties
          }
        >
          <Flex direction="column" gap="1">
            <Text weight="bold">{t('importPretalxFailureTitle')}</Text>
            <Text>{t('importPretalxFailureMessage')}</Text>
          </Flex>
        </Card>
      )}
      <Flex direction="row" gap="2" wrap="wrap">
        {onSaveShift && (
          <AddShiftButton
            event={event}
            teams={managedTeams}
            qualifications={qualifications}
            onSaveShift={onSaveShift}
          />
        )}
        <Button variant="soft" asChild>
          <a
            href={getEventShiftsApiPath(event.slug, { format: 'csv' })}
            rel="noopener noreferrer"
            target="_blank"
            data-umami-event="Export event shifts"
            data-umami-event-eventslug={event.slug}
          >
            <Share2Icon />
            {t('export')}
          </a>
        </Button>
        {hasEventAccess && isPretalxConfigured() && teams.length > 0 && (
          <ImportPretalxButton action={getImportPretalxApiPath(event.slug)} teams={teams} />
        )}
        {hasEventAccess && (
          <SendEmailButton
            variant="soft"
            successMessage={t('emailSuccessMessage')}
            successTitle={t('emailSuccessTitle')}
            failureMessage={t('emailFailureMessage')}
            failureTitle={t('emailFailureTitle')}
            customisable
            numEmails={emailableVolunteers.length}
            emailContext={event.name}
            sendEmail={doNotify}
          >
            <EnvelopeClosedIcon />
            {t('notifyVolunteers')}
          </SendEmailButton>
        )}
      </Flex>
      <Flex direction="column" gap="4">
        <ShiftFilters withFilters={['searchQuery', 'teamId']} teams={teams} />
        <ShiftOverviewList
          event={event}
          teams={teams}
          shifts={shifts}
          shiftVolunteers={shiftVolunteers}
          qualifications={qualifications}
          editableTeams={hasEventAccess ? undefined : new Set(leadTeamsIds)}
          onSaveShift={onSaveShift}
          onDeleteShift={onDeleteShift}
        />
      </Flex>
    </Flex>
  );
}
