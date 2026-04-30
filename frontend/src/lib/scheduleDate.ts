import { addDays, format } from 'date-fns';
import { getWeekStart } from './time';

const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const dayOptions = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type ScheduleDay = typeof dayOptions[number];

export const formatScheduleDate = (date: Date): string => format(date, 'yyyy-MM-dd');

export const parseScheduleDate = (value: string | null): Date | null => {
  if (!value || !DATE_PARAM_PATTERN.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
};

export const getScheduleDay = (date: Date): ScheduleDay => {
  const index = date.getDay() === 0 ? 6 : date.getDay() - 1;
  return dayOptions[index];
};

export const getDateForWeekDay = (week: number, day: ScheduleDay): Date => {
  const dayIndex = dayOptions.indexOf(day);
  return addDays(getWeekStart(week), dayIndex);
};

export const setScheduleDateParam = (params: URLSearchParams, date: Date) => {
  params.set('date', formatScheduleDate(date));
  params.delete('week');
  params.delete('month');
  params.delete('year');
};
