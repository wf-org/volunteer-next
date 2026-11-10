import metadata from '@/i18n/metadata';
import { redirect } from 'next/navigation';
import { Flex, Heading, Card, Text } from '@radix-ui/themes';
import { getTranslations } from 'next-intl/server';
import { cloneEventStructure, createEvent, getEventsById } from '@/service/event-service';
import { addRoleToUsers, getUsers, getUsersWithRole } from '@/service/user-service';
import { checkAuthorisation, currentUser } from '@/session';
import { inTransaction } from '@/db';
import EventForm from '@/ui/event-form';
import { validateNewEvent } from '@/validator/event-validator';
import { validateUserIds } from '@/validator/user-validator';
import { usersToVolunteers } from '@/lib/volunteer';
import { getPermissionsProfile } from '@/utils/permissions';
import { getEventsPath } from '@/utils/path';
import { getMaxImageSizeBytes, uploadImageAction } from '@/lib/image';

const PAGE_KEY = 'CreateEventPage';

export const generateMetadata = metadata(PAGE_KEY);

export default async function CreateEvent({ searchParams }: PageProps<'/create-event'>) {
  const onSubmit = async (data: FormData) => {
    'use server';

    await checkAuthorisation([{ type: 'admin' }]);

    const newEvent = validateNewEvent(data);
    const organiser = validateUserIds(data, 'organiserId')[0]; // Only single organiser supported for now
    const cloneFromId = data.get('cloneFromId')?.toString() || undefined;
    if (cloneFromId && !(await getEventsById([cloneFromId]))[0]) {
      throw new Error('Event to clone not found');
    }

    await inTransaction(async (client) => {
      const createdEvent = await createEvent(newEvent, client);
      await addRoleToUsers({ type: 'organiser', eventId: createdEvent.id }, [organiser], client);
      if (cloneFromId) {
        await cloneEventStructure(cloneFromId, createdEvent.id, client);
      }
    });
    redirect(getEventsPath());
  };

  await checkAuthorisation([{ type: 'admin' }]);
  const t = await getTranslations(PAGE_KEY);
  const permissionsProfile = getPermissionsProfile(await currentUser());
  const volunteers = usersToVolunteers(await getUsers(), permissionsProfile);
  const maxImageSizeBytes = getMaxImageSizeBytes();

  const { from } = await searchParams;
  const cloneFromId = typeof from === 'string' ? from : undefined;
  const cloneSource = cloneFromId ? (await getEventsById([cloneFromId]))[0] : undefined;
  const cloneOrganiserId = cloneSource
    ? (await getUsersWithRole({ type: 'organiser', eventId: cloneSource.id }))[0]?.id
    : undefined;
  const cloneOrganiser = volunteers.find((v) => v.id === cloneOrganiserId);

  return (
    <Flex direction="column" gap="4">
      <Heading my="4">{t(cloneSource ? 'cloneTitle' : 'title')}</Heading>
      {cloneSource && <Text>{t('cloneDescription', { name: cloneSource.name })}</Text>}
      <Card>
        <EventForm
          onUpload={uploadImageAction}
          onSubmit={onSubmit}
          maxImageSizeBytes={maxImageSizeBytes}
          backOnCancel
          organiserOptions={volunteers}
          cloneSource={cloneSource}
          editingOrganiser={cloneOrganiser}
        />
      </Card>
    </Flex>
  );
}
