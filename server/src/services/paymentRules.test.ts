import { describe, expect, it } from 'vitest';
import { validatePaymentAllocations } from './paymentRules.js';

describe('payment allocations', () => {
  it('accepts full and partial allocations when their sum matches the receipt', () => {
    expect(() => validatePaymentAllocations(10000, [{ amountPaise: 10000, remainingPaise: 10000 }])).not.toThrow();
    expect(() => validatePaymentAllocations(3500, [{ amountPaise: 3500, remainingPaise: 10000 }])).not.toThrow();
    expect(() => validatePaymentAllocations(7000, [{ amountPaise: 3000, remainingPaise: 5000 }, { amountPaise: 4000, remainingPaise: 9000 }])).not.toThrow();
  });

  it('rejects an overpayment and leaves any remainder explicitly unallocated', () => {
    expect(() => validatePaymentAllocations(12000, [{ amountPaise: 12000, remainingPaise: 10000 }])).toThrow(/exceeds/);
    expect(() => validatePaymentAllocations(10000, [{ amountPaise: 7000, remainingPaise: 10000 }])).not.toThrow();
    expect(() => validatePaymentAllocations(10000, [])).not.toThrow();
  });
});
