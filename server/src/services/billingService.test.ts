import { describe, expect, it } from 'vitest';
import { billingEligibility } from './billingService.js';

const schedule = { version: 2, monthlyRentPaise: 1300000, dueDay: 31, effectiveFrom: new Date('2026-10-01T12:00:00Z') };
const allocation = { startDate: new Date('2020-03-01T00:00:00Z'), endDate: null, roomNumber: '101', bedId: 'A' };

describe('monthly rent eligibility', () => {
  it('preserves a real admission date before go-live while billing begins in the selected period', () => {
    const result = billingEligibility({ admissionDate: new Date('2020-03-01'), billingStartDate: new Date('2026-10-01'), status: 'ACTIVE', rentSchedules: [schedule], allocations: [allocation] }, '2026-10');
    expect(result.exclusionReason).toBe('');
    expect(result.schedule?.version).toBe(2);
  });
  it('uses a migration rent schedule effective later in the selected go-live period', () => {
    const result = billingEligibility({ admissionDate: new Date('2020-03-01'), billingStartDate: new Date('2026-10-17'), status: 'ACTIVE', rentSchedules: [{ ...schedule, effectiveFrom: new Date('2026-10-17') }], allocations: [allocation] }, '2026-10');
    expect(result.exclusionReason).toBe('');
    expect(result.schedule?.effectiveFrom.toISOString()).toContain('2026-10-17');
  });
  it('excludes a resident whose billing start is after the period', () => {
    const result = billingEligibility({ admissionDate: new Date('2020-03-01'), billingStartDate: new Date('2026-11-01'), status: 'ACTIVE', rentSchedules: [schedule], allocations: [allocation] }, '2026-10');
    expect(result.exclusionReason).toMatch(/not started/);
  });
  it('uses the schedule effective for the selected period and excludes an expired tenancy', () => {
    const result = billingEligibility({ admissionDate: new Date('2020-03-01'), billingStartDate: new Date('2020-03-01'), status: 'INACTIVE', effectiveEndDate: new Date('2026-09-30T12:00:00Z'), rentSchedules: [schedule], allocations: [allocation] }, '2026-10');
    expect(result.exclusionReason).toMatch(/does not cover/);
  });

  it('selects rent schedules and room occupancy at the resident cycle anniversary', () => {
    const result = billingEligibility({
      admissionDate: new Date('2020-03-01'), billingStartDate: new Date('2026-10-26T12:00:00Z'), status: 'ACTIVE',
      rentSchedules: [
        { version: 2, monthlyRentPaise: 1300000, dueDay: 26, effectiveFrom: new Date('2026-10-01T12:00:00Z') },
        { version: 3, monthlyRentPaise: 1500000, dueDay: 26, effectiveFrom: new Date('2026-10-27T12:00:00Z') },
      ],
      allocations: [{ ...allocation, startDate: new Date('2026-10-26T12:00:00Z') }],
    }, '2026-10');
    expect(result.exclusionReason).toBe('');
    expect(result.schedule?.version).toBe(2);
    expect(result.allocation?.roomNumber).toBe('101');
  });

  it('uses rent schedules effective in the cycle month when billing the anniversary cycle', () => {
    const result = billingEligibility({
      admissionDate: new Date('2020-03-01'), billingStartDate: new Date('2026-10-26T12:00:00Z'), status: 'ACTIVE',
      rentSchedules: [
        { version: 2, monthlyRentPaise: 1300000, dueDay: 26, effectiveFrom: new Date('2026-10-01T12:00:00Z') },
        { version: 3, monthlyRentPaise: 1500000, dueDay: 26, effectiveFrom: new Date('2026-11-01T12:00:00Z') },
      ],
      allocations: [{ ...allocation, startDate: new Date('2020-03-01T00:00:00Z') }],
    }, '2026-11');
    expect(result.exclusionReason).toBe('');
    expect(result.schedule?.version).toBe(3);
  });

  it('keeps a schedule change after the rent anniversary out of the current cycle', () => {
    const result = billingEligibility({
      admissionDate: new Date('2020-03-01'), billingStartDate: new Date('2026-10-26T12:00:00Z'), status: 'ACTIVE',
      rentSchedules: [
        { version: 2, monthlyRentPaise: 1300000, dueDay: 26, effectiveFrom: new Date('2026-10-01T12:00:00Z') },
        { version: 3, monthlyRentPaise: 1500000, dueDay: 26, effectiveFrom: new Date('2026-11-27T12:00:00Z') },
      ],
      allocations: [{ ...allocation, startDate: new Date('2020-03-01T00:00:00Z') }],
    }, '2026-11');
    expect(result.exclusionReason).toBe('');
    expect(result.schedule?.version).toBe(2);
  });
});
