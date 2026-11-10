import metadata from '@/i18n/metadata';
import { Heading, Flex, Button, Text, Badge, Card } from '@radix-ui/themes';
import { getTranslations } from 'next-intl/server';
import { checkAuthorisation, currentUser, getCurrentEvent } from '@/session';
import { getFilteredUsers } from '@/service/user-service';
import { markUserAsDeleted, undeleteUser } from '@/service/user-service';
import { revalidatePath } from 'next/cache';
import {
  getCreateUserPath,
  getEditUserPath,
  getUserApiPath,
  getUsersDashboardPath
} from '@/utils/path';
import VolunteerList from '@/ui/volunteer-list';
import { usersToVolunteers } from '@/lib/volunteer';
import { Pencil1Icon, PlusIcon, Share2Icon } from '@radix-ui/react-icons';
import DeleteButton from '@/ui/delete-button';
import { recordToUserFilters } from '@/utils/user-filters';
import { getPermissionsProfile } from '@/utils/permissions';
import NextLink from 'next/link';
import { getHoursForVolunteers } from '@/service/shift-service';
import ImportVolunteersButton from '@/ui/import-volunteers-button';

const PAGE_KEY = 'UsersDashboardPage';
export const generateMetadata = metadata(PAGE_KEY);

export default async function UsersDashboardPage({ searchParams }: PageProps<'/user'>) {
  const resolvedSearchParams = await searchParams;
  const editors: UserRole[] = [{ type: 'admin' }];
  const canEdit = await checkAuthorisation(editors, true);
  const permissionsProfile = getPermissionsProfile(await currentUser());
  const t = await getTranslations(PAGE_KEY);
  const filters = recordToUserFilters(resolvedSearchParams);
  const event = await getCurrentEvent();
  const users = await getFilteredUsers(filters, permissionsProfile, event?.id);
  const volunteers = usersToVolunteers(users, permissionsProfile);
  const withFilters: (keyof UserFilters)[] = ['searchQuery', 'roleType', 'eventHours'];
  if (canEdit) {
    withFilters.push('showDeleted');
  }

  const handleDeleteUser = async (userId: string) => {
    'use server';
    await checkAuthorisation(editors);
    await markUserAsDeleted(userId);
    revalidatePath(getUsersDashboardPath());
  };

  const handleUndeleteUser = async (userId: string) => {
    'use server';
    await checkAuthorisation(editors);
    await undeleteUser(userId);
    revalidatePath(getUsersDashboardPath());
  };

  const itemActions: Record<UserId, React.ReactNode> = {};
  if (canEdit) {
    for (const user of users) {
      itemActions[user.id] = (
        <Flex gap="2">
          <Button variant="outline" asChild>
            <NextLink href={getEditUserPath(user.id)}>
              <Pencil1Icon />
            </NextLink>
          </Button>
          {user.deletedAt ? (
            <Button
              variant="outline"
              color="green"
              onClick={handleUndeleteUser.bind(null, user.id)}
            >
              {t('undelete')}
            </Button>
          ) : (
            <DeleteButton
              title={t('confirmDeletion')}
              description={t('confirmDeleteText', { userName: user.name })}
              onDelete={handleDeleteUser.bind(null, user.id)}
            />
          )}
        </Flex>
      );
    }
  }

  const itemContent: Record<UserId, React.ReactNode> = {};
  if (filters.eventHours !== undefined && event) {
    const hours = await getHoursForVolunteers(
      event.id,
      volunteers.map((v) => v.id)
    );
    for (const volunteer of volunteers) {
      itemContent[volunteer.id] = (
        <Badge variant="soft" color="blue">
          <Text>{t('hoursLabel')}:</Text>
          <Text>{hours[volunteer.id] ?? 0}</Text>
        </Badge>
      );
    }
  }

  const getValue = (key: string): string | undefined => {
    const value = resolvedSearchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const importStatus = getValue('importStatus');
  const attendeeCount = Number(getValue('attendeeCount') ?? 0);
  const createdCount = Number(getValue('createdCount') ?? 0);
  const updatedCount = Number(getValue('updatedCount') ?? 0);
  const undeletedCount = Number(getValue('undeletedCount') ?? 0);

  return (
    <Flex direction="column" gap="4">
      <Heading my="4" as="h1" align="center">
        {t('title')}
      </Heading>
      {importStatus === 'success' && (
        <Card
          style={
            {
              '--card-background-color': 'var(--green-3)',
              borderColor: 'var(--green-8)'
            } as React.CSSProperties
          }
        >
          <Flex direction="column" gap="1">
            <Text weight="bold">{t('importVolunteersSuccessTitle')}</Text>
            <Text>
              {t('importVolunteersSuccessMessage', {
                attendeeCount,
                createdCount,
                updatedCount,
                undeletedCount
              })}
            </Text>
          </Flex>
        </Card>
      )}
      {importStatus === 'failure' && (
        <Card
          style={
            {
              '--card-background-color': 'var(--red-3)',
              borderColor: 'var(--red-8)'
            } as React.CSSProperties
          }
        >
          <Flex direction="column" gap="1">
            <Text weight="bold">{t('importVolunteersFailureTitle')}</Text>
            <Text>{t('importVolunteersFailureMessage')}</Text>
          </Flex>
        </Card>
      )}
      <Flex gap="2" mb="4">
        {canEdit && (
          <Button variant="soft" asChild>
            <NextLink href={getCreateUserPath()}>
              <PlusIcon /> {t('createUser')}
            </NextLink>
          </Button>
        )}
        {canEdit && (
          <ImportVolunteersButton />
        )}
        <Button variant="soft" asChild>
          <NextLink
            href={getUserApiPath(filters, { format: 'csv' })}
            prefetch={false}
            target="_blank"
            rel="noopener"
            data-umami-event="Export event volunteers"
          >
            <Share2Icon />
            {t('export')}
          </NextLink>
        </Button>
      </Flex>
      <VolunteerList
        volunteers={volunteers}
        withFilters={withFilters}
        itemActions={itemActions}
        itemContent={itemContent}
      />
    </Flex>
  );
}
