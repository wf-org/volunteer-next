/**
 * Email template for volunteer notification emails
 * @since 2026-04-01
 * @author Michael Townsend <@continuities>
 */

import { getListByDate } from '@/utils/date';
import { addHoursToTimeString, eventDayToDate, to12HourTimeString } from '@/utils/datetime';
import { getTranslations } from 'next-intl/server';

const TEMPLATE_KEY = 'NotifyEmail';

interface BaseProps {
  body: string;
  subject: string;
}

interface PropsWithShifts extends BaseProps {
  event: EventInfo;
  shifts: ShiftInfo[];
  teams: TeamInfo[];
}

interface PropsWithoutShifts extends BaseProps {
  event?: never;
  shifts?: never;
  teams?: never;
}

type Props = PropsWithShifts | PropsWithoutShifts;

const ShiftList = ({
  event,
  shifts,
  teams
}: {
  event: EventInfo;
  shifts: ShiftInfo[];
  teams: TeamInfo[];
}) => {
  const teamsById = Object.fromEntries(teams.map((team) => [team.id, team]));
  const shiftsByDate = getListByDate(shifts, (s) => eventDayToDate(event.startDate, s.eventDay));
  const timeFormat = event.timeFormat;
  return (
    <ul>
      {Object.entries(shiftsByDate).map(([date, shifts]) => (
        <li key={date}>
          <strong>{date}</strong>
          <ul>
            {shifts.map((shift) => (
              <li key={shift.id}>
                <ShiftRow shift={shift} team={teamsById[shift.teamId]} timeFormat={timeFormat} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
};

const formatShiftTime = (time: TimeString, timeFormat?: '12h' | '24h') =>
  timeFormat === '12h' ? to12HourTimeString(time) : time;

const ShiftRow = ({
  shift,
  team,
  timeFormat
}: {
  shift: ShiftInfo;
  team: TeamInfo | undefined;
  timeFormat?: '12h' | '24h';
}) => (
  <>
    {shift.title}
    {team ? ` (${team.name})` : ''} {formatShiftTime(shift.startTime, timeFormat)} to{' '}
    {formatShiftTime(addHoursToTimeString(shift.startTime, shift.durationHours), timeFormat)}
  </>
);

export async function body(props: Props) {
  const t = await getTranslations(TEMPLATE_KEY);
  return (
    <>
      <pre style={{ fontFamily: 'inherit' }}>{props.body}</pre>
      {props.shifts && (
        <>
          <p>{t('yourShifts')}</p>
          <ShiftList event={props.event} shifts={props.shifts} teams={props.teams} />
        </>
      )}
    </>
  );
}

export async function subject({ subject }: Props) {
  return subject;
}
