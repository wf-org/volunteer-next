import metadata from '@/i18n/metadata';
import { redirect, unauthorized } from 'next/navigation';
import { Flex, Heading } from '@radix-ui/themes';
import { getTranslations } from 'next-intl/server';
import { addRoleToUsers } from '@/service/user-service';
import { checkAuthorisation, getCurrentEventOrRedirect } from '@/session';
import { inTransaction } from '@/db';
import TeamForm from '@/ui/team-form';
import { validateNewTeam } from '@/validator/team-validator';
import { createTeam } from '@/service/team-service';
import { getTeamsPath } from '@/utils/path';
import { hasEventStarted } from '@/utils/date';

const PAGE_KEY = 'CreateTeamPage';

const parseRequireTeamLead = (value: string | undefined): boolean => {
  if (!value) {
    return true;
  }
  return value.split(/\s+#/)[0].trim().toLowerCase() === 'true';
};

const getTeamLeadIds = (data: FormData, requireTeamLead: boolean): string[] => {
  const teamLeadIds = data
    .getAll('teamleadId')
    .map((value) => value.toString().trim())
    .filter((id) => id.length > 0);

  if (requireTeamLead && teamLeadIds.length === 0) {
    throw new Error('At least one team lead is required');
  }

  return teamLeadIds;
};

export const generateMetadata = metadata(PAGE_KEY);

export default async function CreateTeam() {
  const event = await getCurrentEventOrRedirect();
  const defaultContactAddress = process.env.DEFAULT_TEAM_CONTACT_ADDRESS?.trim();
  const requireTeamLead = parseRequireTeamLead(process.env.REQUIRE_TEAM_LEAD);

  await checkAuthorisation([{ type: 'admin' }, { type: 'organiser', eventId: event.id }]);
  const t = await getTranslations(PAGE_KEY);

  const onSubmit = async (data: FormData) => {
    'use server';

    if (hasEventStarted(event)) {
      unauthorized();
    }

    await checkAuthorisation([{ type: 'admin' }, { type: 'organiser', eventId: event.id }]);

    const newTeam = validateNewTeam(data);
    const teamleads = getTeamLeadIds(data, requireTeamLead);

    await inTransaction(async (client) => {
      const createdTeam = await createTeam(newTeam, client);
      if (teamleads.length > 0) {
        await addRoleToUsers(
          { type: 'team-lead', eventId: event.id, teamId: createdTeam.id },
          teamleads,
          client
        );
      }
    });
    redirect(getTeamsPath());
  };

  return (
    <Flex direction="column" gap="4">
      <Heading my="4" as="h1" align="center">
        {t('title')}
      </Heading>
      <TeamForm
        eventId={event.id}
        onSubmit={onSubmit}
        backOnCancel
        defaultContactAddress={defaultContactAddress}
        requireTeamLead={requireTeamLead}
      />
    </Flex>
  );
}
