import { describe, expect, it } from 'vitest';
import { businessPeriodKey, classifyRentCharge, overdueRentCutoff, startOfBusinessDay, summarizeRentCharges } from './rentStatus.js';

const rent = (dueAt: string, amountPaise = 10_000, paidPaise = 0, externalPaidPaise = 0) => ({
  kind: 'RENT', amountPaise, paidPaise, externalPaidPaise, dueAt: new Date(dueAt),
});

describe('rent payment status', () => {
  const now = new Date('2026-10-18T12:00:00.000Z');

  it('keeps a charge in grace through five calendar days and marks it overdue on day six', () => {
    expect(classifyRentCharge(rent('2026-10-13T18:29:59.999Z'), now)).toMatchObject({ status: 'DUE_GRACE', daysPastDue: 5 });
    expect(classifyRentCharge(rent('2026-10-12T18:29:59.999Z'), now)).toMatchObject({ status: 'OVERDUE', daysPastDue: 6 });
  });

  it('uses the business date near UTC and month boundaries', () => {
    expect(businessPeriodKey(new Date('2026-10-31T20:00:00.000Z'))).toBe('2026-11');
    const beforeIndiaMidnight = new Date('2026-10-31T18:29:59.999Z');
    const afterIndiaMidnight = new Date('2026-10-31T18:30:00.000Z');
    expect(businessPeriodKey(beforeIndiaMidnight)).toBe('2026-10');
    expect(businessPeriodKey(afterIndiaMidnight)).toBe('2026-11');
    expect(startOfBusinessDay(afterIndiaMidnight).toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });

  it('deducts partial internal and external payments before classifying', () => {
    expect(classifyRentCharge(rent('2026-10-12T18:29:59.999Z', 10_000, 4_000, 6_000))).toMatchObject({ status: 'CLEARED', balancePaise: 0 });
    expect(classifyRentCharge(rent('2026-10-12T18:29:59.999Z', 10_000, 2_500), now)).toMatchObject({ status: 'OVERDUE', balancePaise: 7_500 });
  });

  it('aggregates multiple rent charges while excluding other charge kinds', () => {
    const result = summarizeRentCharges([
      rent('2026-10-12T18:29:59.999Z', 10_000, 2_000),
      rent('2026-10-17T18:29:59.999Z', 5_000),
      { kind: 'OPENING_BALANCE', amountPaise: 99_000, dueAt: new Date('2026-01-01T00:00:00Z') },
    ], now);
    expect(result).toMatchObject({ status: 'OVERDUE', balancePaise: 13_000, daysPastDue: 6, chargeCount: 2 });
  });

  it('returns no bill separately from a cleared bill', () => {
    expect(summarizeRentCharges([], now).status).toBe('NO_BILL');
    expect(summarizeRentCharges([rent('2026-10-17T18:29:59.999Z', 10_000, 5_000, 5_000)], now)).toMatchObject({ status: 'CLEARED', dueAt: new Date('2026-10-17T18:29:59.999Z') });
  });

  it('sets an Asia/Kolkata calendar cutoff rather than a rolling 120-hour cutoff', () => {
    expect(overdueRentCutoff(new Date('2026-10-18T12:00:00.000Z')).toISOString()).toBe('2026-10-12T18:30:00.000Z');
  });
});
