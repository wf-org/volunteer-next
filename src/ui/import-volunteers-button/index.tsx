'use client';

import { Button, Flex, Text } from '@radix-ui/themes';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function ImportVolunteersButton() {
  const [pending, setPending] = useState(false);
  const t = useTranslations('UsersDashboardPage');

  return (
    <form
      action="/api/user/import-volunteers"
      method="post"
      onSubmit={() => setPending(true)}
    >
      <Flex direction="column" gap="1" align="start">
        <Button type="submit" variant="soft" disabled={pending} aria-busy={pending}>
          {pending ? t('importVolunteersPending') : t('importVolunteers')}
        </Button>
        {pending && (
          <Text size="1" color="gray">
            {t('importVolunteersProcessingHint')}
          </Text>
        )}
      </Flex>
    </form>
  );
}
