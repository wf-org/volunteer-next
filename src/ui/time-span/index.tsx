/**
 * Simple component to display a time span, e.g. "9:00am - 5:00pm"
 * Doesn't do any timezone offsetting, since we're using "Z" to represent "event timezone".
 * @since 2026-02-24
 * @author Michael Townsend <@continuities>
 */

'use client';

import { Flex, Text } from '@radix-ui/themes';
import { ClockIcon } from '@radix-ui/react-icons';
import { stringToTime, to12HourTimeString } from '@/utils/datetime';

const DATE_TIME_OPTIONS_BASE: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC'
};

const isSameDisplayDay = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth() &&
  a.getUTCDate() === b.getUTCDate();

const formatTime = (date: Date, use12Hour: boolean) =>
  date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: use12Hour,
    timeZone: 'UTC' // this is because we're using "Z" to represent "event timezone", so we want to display the time as-is without any timezone conversion
  });

const formatDateTime = (date: Date, use12Hour: boolean) =>
  date.toLocaleString([], {
    ...DATE_TIME_OPTIONS_BASE,
    hour12: use12Hour
  });

interface Props {
  start: Date | TimeString;
  end: Date | TimeString;
  timeFormat?: '12h' | '24h';
}

export default function TimeSpan({ start, end, timeFormat = '24h' }: Props) {
  const bothAreDates = start instanceof Date && end instanceof Date;
  const multiDay = bothAreDates && !isSameDisplayDay(start, end);
  const use12Hour = timeFormat === '12h';

  const startTime =
    start instanceof Date
      ? formatTime(start, use12Hour)
      : use12Hour
        ? to12HourTimeString(stringToTime(start))
        : stringToTime(start);

  const endTime =
    end instanceof Date
      ? multiDay
        ? formatDateTime(end, use12Hour)
        : formatTime(end, use12Hour)
      : use12Hour
        ? to12HourTimeString(stringToTime(end))
        : stringToTime(end);

  return (
    <Flex asChild align="center" gap="2">
      <Text>
        <ClockIcon /> {startTime} - {endTime}
      </Text>
    </Flex>
  );
}
