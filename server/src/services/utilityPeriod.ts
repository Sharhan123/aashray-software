import { z } from 'zod';

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day;
}, 'Enter a valid calendar date.');

export const utilityPeriodSchema = z.object({
  // periodKey remains accepted for older clients; new clients provide the exact service dates.
  periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  servicePeriodStart: calendarDay.optional(),
  servicePeriodEnd: calendarDay.optional(),
}).superRefine((value, context) => {
  const hasStart = Boolean(value.servicePeriodStart);
  const hasEnd = Boolean(value.servicePeriodEnd);
  if (hasStart !== hasEnd) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide both service period dates.' });
  if (!hasStart && !value.periodKey) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide the service period dates.' });
  if (value.servicePeriodStart && value.servicePeriodEnd && value.servicePeriodStart > value.servicePeriodEnd) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['servicePeriodEnd'], message: 'The end date must be on or after the start date.' });
  }
});

export function resolveUtilityPeriod(value: { periodKey?: string; servicePeriodStart?: string; servicePeriodEnd?: string }) {
  let start = value.servicePeriodStart;
  let end = value.servicePeriodEnd;
  if (!start || !end) {
    const [year, month] = value.periodKey!.split('-').map(Number);
    start = `${value.periodKey}-01`;
    end = `${value.periodKey}-${String(new Date(Date.UTC(year!, month!, 0)).getUTCDate()).padStart(2, '0')}`;
  }
  return {
    periodKey: start.slice(0, 7),
    servicePeriodStart: new Date(`${start}T00:00:00.000Z`),
    servicePeriodEnd: new Date(`${end}T00:00:00.000Z`),
    servicePeriodStartText: start,
    servicePeriodEndText: end,
  };
}

export function utilityPeriodDescription(start: string, end: string) {
  const format = (value: string) => new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${value}T00:00:00+05:30`));
  return `${format(start)} to ${format(end)}`;
}

export function utilityPeriodMonthKeys(period: ReturnType<typeof resolveUtilityPeriod>) {
  const [startYear, startMonth] = period.servicePeriodStartText.slice(0, 7).split('-').map(Number);
  const [endYear, endMonth] = period.servicePeriodEndText.slice(0, 7).split('-').map(Number);
  const keys: string[] = [];
  for (let cursor = new Date(Date.UTC(startYear!, startMonth! - 1, 1)); cursor <= new Date(Date.UTC(endYear!, endMonth! - 1, 1)); cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    keys.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}
