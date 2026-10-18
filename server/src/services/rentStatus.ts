import { chargeBalance, type ChargeLedgerInput } from './financialCalculations.js';

export const BUSINESS_TIME_ZONE = 'Asia/Kolkata';
export const RENT_GRACE_CALENDAR_DAYS = 5;

export type RentStatus = 'NO_BILL' | 'CLEARED' | 'UPCOMING' | 'DUE_GRACE' | 'OVERDUE';
type RentCharge = ChargeLedgerInput & { kind?: string; periodKey?: string };

function localDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}

function dayOrdinal({ year, month, day }: { year: number; month: number; day: number }) {
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function businessDayDifference(from: Date, to = new Date()): number {
  return dayOrdinal(localDateParts(to)) - dayOrdinal(localDateParts(from));
}

export function startOfBusinessDay(value = new Date()): Date {
  const { year, month, day } = localDateParts(value);
  return new Date(Date.UTC(year, month - 1, day) - 330 * 60_000);
}

export function overdueRentCutoff(now = new Date()): Date {
  const today = startOfBusinessDay(now);
  return new Date(today.getTime() - RENT_GRACE_CALENDAR_DAYS * 86_400_000);
}

export function businessMonthRange(now = new Date()) {
  const { year, month } = localDateParts(now);
  const start = new Date(Date.UTC(year, month - 1, 1) - 330 * 60_000);
  const end = new Date(Date.UTC(year, month, 1) - 330 * 60_000);
  return { start, end };
}

export function businessPeriodKey(date: Date): string {
  const { year, month } = localDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function classifyRentCharge(charge: RentCharge, now = new Date()) {
  const balancePaise = chargeBalance(charge);
  const daysPastDue = Math.max(0, businessDayDifference(charge.dueAt, now));
  const status: RentStatus = balancePaise === 0
    ? 'CLEARED'
    : daysPastDue === 0
      ? 'UPCOMING'
      : daysPastDue <= RENT_GRACE_CALENDAR_DAYS ? 'DUE_GRACE' : 'OVERDUE';
  return { status, balancePaise, dueAt: charge.dueAt, daysPastDue };
}

export function summarizeRentCharges(charges: RentCharge[], now = new Date()) {
  const rentCharges = charges.filter((charge) => charge.kind === undefined || charge.kind === 'RENT');
  if (!rentCharges.length) return { status: 'NO_BILL' as const, balancePaise: 0, dueAt: null, daysPastDue: 0, chargeCount: 0 };
  const classified = rentCharges.map((charge) => ({ charge, ...classifyRentCharge(charge, now) }));
  const balancePaise = classified.reduce((sum, charge) => sum + charge.balancePaise, 0);
  const eligible = classified.filter((charge) => charge.balancePaise > 0).sort((a, b) => a.charge.dueAt.getTime() - b.charge.dueAt.getTime());
  const firstIssued = [...classified].sort((a, b) => a.charge.dueAt.getTime() - b.charge.dueAt.getTime())[0];
  const oldest = eligible[0];
  const status: RentStatus = balancePaise === 0 ? 'CLEARED'
    : classified.some((charge) => charge.status === 'OVERDUE') ? 'OVERDUE'
      : classified.some((charge) => charge.status === 'DUE_GRACE') ? 'DUE_GRACE' : 'UPCOMING';
  return { status, balancePaise, dueAt: oldest?.charge.dueAt ?? firstIssued?.charge.dueAt ?? null, daysPastDue: oldest?.daysPastDue ?? 0, chargeCount: rentCharges.length };
}

export function rentChargeMongoFilter(status: Exclude<RentStatus, 'NO_BILL'>, now = new Date()) {
  const paid = { $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] };
  if (status === 'CLEARED') return { $expr: { $gte: [paid, '$amountPaise'] } };
  const base: Record<string, unknown> = { $expr: { $lt: [paid, '$amountPaise'] } };
  if (status === 'OVERDUE') base.dueAt = { $lt: overdueRentCutoff(now) };
  if (status === 'DUE_GRACE') base.dueAt = { $gte: overdueRentCutoff(now), $lt: startOfBusinessDay(now) };
  if (status === 'UPCOMING') base.dueAt = { $gte: startOfBusinessDay(now) };
  return base;
}
