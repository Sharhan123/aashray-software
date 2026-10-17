export function paiseFromRupees(value: number, allowZero = false): number {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) throw new Error('Amount must be a positive value with at most two decimal places.');
  const [whole = '', fraction = ''] = value.toString().split('.');
  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(fraction)) throw new Error('Amount must have at most two decimal places.');
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(paise)) throw new Error('Amount is too large.');
  return paise;
}

export function periodKeyFor(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function dueDateForPeriod(periodKey: string, dueDay: number): Date {
  const [year = 2000, month = 1] = periodKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // India local midnight boundary (UTC+05:30): keep the charge payable through
  // the full due date in the business timezone.
  return new Date(Date.UTC(year, month - 1, Math.min(dueDay, lastDay), 18, 29, 59, 999));
}

export function periodStart(periodKey: string): Date {
  const [year = 2000, month = 1] = periodKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1, 12));
}

export function periodEnd(periodKey: string): Date {
  const [year = 2000, month = 1] = periodKey.split('-').map(Number);
  return new Date(Date.UTC(year, month, 1));
}

export function chargeStatus(amountPaise: number, paidPaise: number, dueAt: Date, now = new Date()) {
  if (paidPaise >= amountPaise) return 'PAID' as const;
  if (dueAt < now) return 'OVERDUE' as const;
  if (paidPaise > 0) return 'PARTIAL' as const;
  return 'PENDING' as const;
}
