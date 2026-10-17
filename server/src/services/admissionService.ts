import { randomInt } from 'node:crypto';
import { Resident } from '../models/Resident.js';
import { Room } from '../models/Room.js';
import { RoomAllocation } from '../models/RoomAllocation.js';
import { Charge } from '../models/Charge.js';
import { DepositTransaction } from '../models/DepositTransaction.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { inTransaction } from './transactions.js';
import { dueDateForPeriod, paiseFromRupees, periodKeyFor } from './billingRules.js';

export interface AdmissionInput {
  idempotencyKey: string; fullName: string; mobile: string; email: string; governmentId: string; emergencyContact: string;
  admissionDate: Date; billingStartDate: Date; roomId: string; bedId: string; monthlyRent: number; dueDay: number;
  securityDeposit: number; depositPaid: number; depositMethod: 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'OTHER'; notes: string;
}

export async function admitResident(data: AdmissionInput, actorId: string) {
  const existing = await Resident.findOne({ admissionIdempotencyKey: data.idempotencyKey });
  if (existing) return { resident: existing, duplicate: true, initialCharge: null };
  const room = await Room.findOne({ _id: data.roomId, active: true });
  if (!room || !room.beds.some((bed) => bed.bedId === data.bedId && bed.active)) throw Object.assign(new Error('Select an active room and bed.'), { status: 422 });
  const month = periodKeyFor(data.billingStartDate);
  const rentPaise = paiseFromRupees(data.monthlyRent);
  const depositPaise = paiseFromRupees(data.securityDeposit, true); const depositPaidPaise = paiseFromRupees(data.depositPaid, true);
  const residentId = `ASH-${new Date().getUTCFullYear().toString().slice(-2)}-${randomInt(100000, 1000000)}`;
  try {
    const resident = await inTransaction(async (session) => {
      const now = new Date();
      const created = (await Resident.create([{ residentId, admissionIdempotencyKey: data.idempotencyKey, ...data, email: data.email.toLowerCase(), securityDepositPaise: depositPaise, status: 'ACTIVE', createdBy: actorId, allocations: [{ roomId: room._id, roomNumber: room.roomNumber, bedId: data.bedId, startDate: data.admissionDate, changedBy: actorId }], rentSchedules: [{ version: 1, monthlyRentPaise: rentPaise, dueDay: data.dueDay, effectiveFrom: data.billingStartDate, changedBy: actorId }] }], { session }))[0]!;
      await RoomAllocation.create([{ residentId: created._id, roomId: room._id, bedId: data.bedId, startDate: data.admissionDate, changedBy: actorId }], { session });
      await Charge.create([{ residentId: created._id, kind: 'RENT', periodKey: month, description: `Rent for ${month}`, amountPaise: rentPaise, issuedAt: now, dueAt: dueDateForPeriod(month, data.dueDay), scheduleVersion: 1, idempotencyKey: `rent:${created._id}:${month}`, createdBy: actorId }], { session });
      if (depositPaidPaise > 0) await DepositTransaction.create([{ residentId: created._id, amountPaise: depositPaidPaise, kind: 'RECEIVED', paymentMethod: data.depositMethod, createdBy: actorId, reason: 'Initial security deposit', idempotencyKey: `deposit:${created._id}:initial` }], { session });
      await AuditEvent.create([{ actorId, action: 'RESIDENT_ADMITTED', entityType: 'Resident', entityId: String(created._id), details: { residentId: created.residentId, roomNumber: room.roomNumber, bedId: data.bedId, periodKey: month } }], { session });
      return created;
    });
    return { resident, duplicate: false, initialCharge: { periodKey: month, amountPaise: rentPaise, dueAt: dueDateForPeriod(month, data.dueDay) } };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const retry = await Resident.findOne({ admissionIdempotencyKey: data.idempotencyKey });
      if (retry) return { resident: retry, duplicate: true, initialCharge: null };
    }
    throw error;
  }
}
