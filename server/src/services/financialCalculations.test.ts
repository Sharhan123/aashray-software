import { describe, expect, it } from 'vitest';
import { chargeBalance, chargeLedger, residentFinancialSummary } from './financialCalculations.js';

describe('shared charge ledger calculations', () => {
  const dueAt = new Date('2026-10-31T18:29:59.999Z');
  it('reconciles software payments and verified external settlement independently', () => {
    expect(chargeBalance({ amountPaise: 1300000, paidPaise: 500000, externalPaidPaise: 300000, dueAt })).toBe(500000);
    expect(chargeLedger({ amountPaise: 1300000, paidPaise: 500000, externalPaidPaise: 800000, dueAt }).status).toBe('PAID');
  });
  it('does not return a negative balance for excess legacy amounts', () => {
    expect(chargeBalance({ amountPaise: 1000, paidPaise: 1000, externalPaidPaise: 300, dueAt })).toBe(0);
  });
  it('keeps rent, opening rent, and utility balances in one resident-level summary', () => {
    const summary = residentFinancialSummary([
      { kind: 'RENT', amountPaise: 1300000, paidPaise: 500000, dueAt: new Date('2026-10-31') },
      { kind: 'OPENING_BALANCE', amountPaise: 500000, externalPaidPaise: 100000, dueAt: new Date('2026-09-01') },
      { kind: 'UTILITY', amountPaise: 100000, paidPaise: 25000, dueAt: new Date('2026-10-31') },
    ], new Date('2026-10-17'));
    expect(summary).toEqual({ outstandingPaise: 1275000, overdueRentPaise: 400000, pendingUtilityPaise: 75000, rentBilledPaise: 1300000 });
  });
});
