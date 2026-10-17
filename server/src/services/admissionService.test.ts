import { beforeEach, describe, expect, it, vi } from 'vitest';

const { roomFindOne, residentFindOne, residentCreate, allocationCreate, chargeCreate, depositCreate, auditCreate, inTransaction } = vi.hoisted(() => ({
  roomFindOne: vi.fn(), residentFindOne: vi.fn(), residentCreate: vi.fn(), allocationCreate: vi.fn(), chargeCreate: vi.fn(), depositCreate: vi.fn(), auditCreate: vi.fn(), inTransaction: vi.fn(),
}));

vi.mock('../models/Room.js', () => ({ Room: { findOne: roomFindOne } }));
vi.mock('../models/Resident.js', () => ({ Resident: { findOne: residentFindOne, create: residentCreate } }));
vi.mock('../models/RoomAllocation.js', () => ({ RoomAllocation: { create: allocationCreate } }));
vi.mock('../models/Charge.js', () => ({ Charge: { create: chargeCreate } }));
vi.mock('../models/DepositTransaction.js', () => ({ DepositTransaction: { create: depositCreate } }));
vi.mock('../models/AuditEvent.js', () => ({ AuditEvent: { create: auditCreate } }));
vi.mock('./transactions.js', () => ({ inTransaction }));

import { admitResident } from './admissionService.js';

const admission = {
  idempotencyKey: '550e8400-e29b-41d4-a716-446655440000', fullName: 'Test Resident', mobile: '+919876543210', email: '',
  governmentId: '', emergencyContact: '', admissionDate: new Date('2026-10-01T00:00:00Z'), billingStartDate: new Date('2026-10-01T00:00:00Z'),
  roomId: '507f1f77bcf86cd799439011', bedId: '1', monthlyRent: 8500, dueDay: 31, securityDeposit: 10000, depositPaid: 5000,
  depositMethod: 'UPI' as const, notes: '',
};

describe('resident admission transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    residentFindOne.mockResolvedValue(null);
    roomFindOne.mockResolvedValue({ _id: admission.roomId, roomNumber: '101', beds: [{ bedId: '1', active: true }] });
    residentCreate.mockResolvedValue([{ _id: '507f1f77bcf86cd799439012', residentId: 'ASH-26-123456' }]);
    inTransaction.mockImplementation(async (work) => work({}));
  });

  it('creates the resident, active bed allocation, exactly one initial charge, and paid deposit atomically', async () => {
    const result = await admitResident(admission, '507f1f77bcf86cd799439013');
    expect(result.duplicate).toBe(false);
    expect(residentCreate).toHaveBeenCalledOnce();
    expect(allocationCreate).toHaveBeenCalledOnce();
    expect(chargeCreate).toHaveBeenCalledOnce();
    expect(chargeCreate.mock.calls[0]?.[0][0]).toMatchObject({ kind: 'RENT', periodKey: '2026-10', amountPaise: 850000, idempotencyKey: expect.stringContaining(':2026-10') });
    expect(depositCreate).toHaveBeenCalledOnce();
    expect(depositCreate.mock.calls[0]?.[0][0]).toMatchObject({ amountPaise: 500000, kind: 'RECEIVED' });
    expect(inTransaction).toHaveBeenCalledOnce();
  });

  it('returns the existing admission when a request is retried with the same idempotency key', async () => {
    residentFindOne.mockResolvedValue({ _id: 'existing' });
    const result = await admitResident(admission, 'actor');
    expect(result.duplicate).toBe(true);
    expect(residentCreate).not.toHaveBeenCalled();
    expect(chargeCreate).not.toHaveBeenCalled();
  });

  it('rejects an inactive bed before starting a transaction', async () => {
    roomFindOne.mockResolvedValue({ _id: admission.roomId, roomNumber: '101', beds: [{ bedId: '1', active: false }] });
    await expect(admitResident(admission, 'actor')).rejects.toMatchObject({ status: 422 });
    expect(inTransaction).not.toHaveBeenCalled();
  });
});
