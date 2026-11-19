'use client';

import { Button, Dialog, Flex, Select, Text } from '@radix-ui/themes';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  action: string;
  teams: TeamInfo[];
}

export default function ImportPretalxButton({ action, teams }: Props) {
  const [pending, setPending] = useState(false);
  const [teamId, setTeamId] = useState<TeamId | undefined>(
    teams.length === 1 ? teams[0].id : undefined
  );
  const t = useTranslations('EventShiftsPage');

  return (
    <Dialog.Root>
      <Dialog.Trigger>
        <Button variant="soft">{t('importPretalx')}</Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="450px">
        <Dialog.Title>{t('importPretalx')}</Dialog.Title>
        <Dialog.Description size="2" mb="4">
          {t('importPretalxDescription')}
        </Dialog.Description>
        <form action={action} method="post" onSubmit={() => setPending(true)}>
          <Flex direction="column" gap="3">
            <Text as="label" size="2" weight="bold" id="pretalx-team">
              {t('importPretalxTeam')}
            </Text>
            <Select.Root required name="teamId" value={teamId} onValueChange={setTeamId}>
              <Select.Trigger aria-labelledby="pretalx-team" placeholder={t('importPretalxTeam')} />
              <Select.Content>
                {teams.map((team) => (
                  <Select.Item key={team.id} value={team.id}>
                    {team.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
            {pending && (
              <Text size="1" color="gray">
                {t('importPretalxProcessingHint')}
              </Text>
            )}
            <Flex gap="3" mt="2" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray" type="button" disabled={pending}>
                  {t('cancel')}
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={pending || !teamId} aria-busy={pending}>
                {pending ? t('importPretalxPending') : t('importPretalxSubmit')}
              </Button>
            </Flex>
          </Flex>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
