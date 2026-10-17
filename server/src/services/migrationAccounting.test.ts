import { describe, expect, it } from 'vitest';
import { migrationOpeningPosition } from './migrationAccounting.js';

describe('migration opening position', () => {
  it('applies verified prepaid rent to arrears and carries only the remainder forward', () => {
    expect(migrationOpeningPosition(1300000, 500000)).toEqual({ openingArrearsPaise: 1300000, prepaidRentPaise: 500000, prepaidAppliedToArrearsPaise: 500000, openingBalancePaise: 800000, creditRemainingPaise: 0 });
  });
  it('does not create a negative opening balance when prepaid exceeds arrears', () => {
    expect(migrationOpeningPosition(300000, 500000)).toEqual({ openingArrearsPaise: 300000, prepaidRentPaise: 500000, prepaidAppliedToArrearsPaise: 300000, openingBalancePaise: 0, creditRemainingPaise: 200000 });
  });
});
