import { describe, expect, it } from 'vitest';
import { admissionBillingStartDate, billingDayForDate, chargeStatus, dueDateForBillingStart, dueDateForPeriod, paiseFromRupees, periodKeyFor } from './billingRules.js';

describe('billing rules', () => {
  it('uses each resident billing start calendar day as the monthly due day', () => {
    expect(billingDayForDate(new Date('2026-10-17T00:00:00.000Z'))).toBe(17);
    expect(dueDateForBillingStart('2026-10', new Date('2026-10-17T00:00:00.000Z')).toISOString()).toBe('2026-10-17T18:29:59.999Z');
  });

  it('starts software billing this month for long-term residents and uses their admission day', () => {
    const start = admissionBillingStartDate(new Date('2026-10-18T12:00:00.000Z'), new Date('2023-02-28T00:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-10-28T12:00:00.000Z');
    expect(periodKeyFor(start)).toBe('2026-10');
  });

  it('clamps a billing anniversary to the last day of shorter months', () => {
    expect(dueDateForBillingStart('2025-02', new Date('2026-01-31T00:00:00.000Z')).toISOString()).toBe('2025-02-28T18:29:59.999Z');
  });

  it('uses integer paise and rejects excess precision', () => {
    expect(paiseFromRupees(1234.5)).toBe(123450);
    expect(() => paiseFromRupees(12.345)).toThrow();
  });

  it('caps a due day of 31 at the end of shorter months', () => {
    expect(dueDateForPeriod('2025-02', 31).toISOString()).toBe('2025-02-28T18:29:59.999Z');
    expect(dueDateForPeriod('2024-02', 31).toISOString()).toBe('2024-02-29T18:29:59.999Z');
  });

  it('uses the billing start month and distinguishes partial, paid, and overdue balances', () => {
    expect(periodKeyFor(new Date('2026-05-20T12:00:00Z'))).toBe('2026-05');
    expect(periodKeyFor(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11');
    expect(periodKeyFor(new Date('2026-10-31T18:29:59.999Z'))).toBe('2026-10');
    expect(chargeStatus(10000, 0, new Date('2025-01-01'), new Date('2025-01-02'))).toBe('OVERDUE');
    expect(chargeStatus(10000, 1000, new Date('2027-01-01'))).toBe('PARTIAL');
    expect(chargeStatus(10000, 10000, new Date('2025-01-01'))).toBe('PAID');
  });
});
