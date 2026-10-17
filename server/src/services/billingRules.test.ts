import { describe, expect, it } from 'vitest';
import { chargeStatus, dueDateForPeriod, paiseFromRupees, periodKeyFor } from './billingRules.js';

describe('billing rules', () => {
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
    expect(chargeStatus(10000, 0, new Date('2025-01-01'), new Date('2025-01-02'))).toBe('OVERDUE');
    expect(chargeStatus(10000, 1000, new Date('2027-01-01'))).toBe('PARTIAL');
    expect(chargeStatus(10000, 10000, new Date('2025-01-01'))).toBe('PAID');
  });
});
