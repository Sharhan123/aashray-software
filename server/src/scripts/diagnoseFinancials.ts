import { connectDatabase } from '../config/database.js';
import mongoose from 'mongoose';
import { Resident } from '../models/Resident.js';
import { Charge } from '../models/Charge.js';
import { Payment } from '../models/Payment.js';
import { RoomAllocation } from '../models/RoomAllocation.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { ResidentMigration } from '../models/ResidentMigration.js';
import { chargeLedger as ledgerForCharge } from '../services/financialCalculations.js';

/** Read-only diagnostic for the configured database. Prints IDs/counts only. */
async function main() {
  await connectDatabase();
  const [residentCount, chargeCount, paymentCount, allocationCount, depositsCount, migrationCount] = await Promise.all([
    Resident.countDocuments(), Charge.countDocuments(), Payment.countDocuments(), RoomAllocation.countDocuments(),
    mongoose.connection.collection('deposittransactions').countDocuments(),
    ResidentMigration.countDocuments(),
  ]);
  const [duplicateRent, orphanCharges, chargeLedger, paymentAudit, orphanPayments, paymentResidentMismatch, overAllocatedPayments, unallocatedPayments, allocationAudit, residentsWithoutSchedule] = await Promise.all([
    Charge.aggregate([{ $match: { kind: 'RENT' } }, { $group: { _id: { residentId: '$residentId', periodKey: '$periodKey' }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }]),
    Charge.aggregate([{ $lookup: { from: 'residents', localField: 'residentId', foreignField: '_id', as: 'resident' } }, { $match: { resident: { $eq: [] } } }, { $count: 'count' }]),
    Charge.aggregate([{ $lookup: { from: 'payments', let: { chargeId: '$_id' }, pipeline: [{ $match: { reversedAt: null } }, { $unwind: '$allocations' }, { $match: { $expr: { $eq: ['$allocations.chargeId', '$$chargeId'] } } }, { $group: { _id: null, allocated: { $sum: '$allocations.amountPaise' } } }], as: 'allocationTotal' } }, { $addFields: { allocationTotal: { $ifNull: [{ $first: '$allocationTotal.allocated' }, 0] } } }, { $match: { $expr: { $ne: ['$paidPaise', '$allocationTotal'] } } }, { $project: { _id: 1, residentId: 1, periodKey: 1, kind: 1, paidPaise: 1, allocationTotal: 1 } }]),
    Payment.aggregate([{ $match: { reversedAt: { $ne: null } } }, { $count: 'count' }]),
    Payment.aggregate([{ $lookup: { from: 'residents', localField: 'residentId', foreignField: '_id', as: 'resident' } }, { $match: { resident: { $eq: [] } } }, { $count: 'count' }]),
    Payment.aggregate([{ $unwind: '$allocations' }, { $lookup: { from: 'charges', localField: 'allocations.chargeId', foreignField: '_id', as: 'charge' } }, { $match: { $expr: { $and: [{ $gt: [{ $size: '$charge' }, 0] }, { $ne: ['$residentId', { $first: '$charge.residentId' }] }] } } }, { $project: { paymentId: '$_id', chargeId: '$allocations.chargeId', residentId: 1, chargeResidentId: { $first: '$charge.residentId' } } }]),
    Payment.aggregate([{ $project: { _id: 1, amountPaise: 1, reversedAt: 1, allocatedPaise: { $sum: '$allocations.amountPaise' } } }, { $match: { $expr: { $gt: ['$allocatedPaise', '$amountPaise'] } } }, { $project: { _id: 1, amountPaise: 1, allocatedPaise: 1, reversedAt: 1 } }]),
    Payment.aggregate([{ $project: { _id: 1, amountPaise: 1, reversedAt: 1, allocatedPaise: { $sum: '$allocations.amountPaise' } } }, { $match: { reversedAt: null, $expr: { $lt: ['$allocatedPaise', '$amountPaise'] } } }, { $project: { _id: 1, amountPaise: 1, allocatedPaise: 1, unallocatedPaise: { $subtract: ['$amountPaise', '$allocatedPaise'] } } }]),
    Payment.aggregate([{ $unwind: '$allocations' }, { $lookup: { from: 'charges', localField: 'allocations.chargeId', foreignField: '_id', as: 'charge' } }, { $match: { charge: { $eq: [] } } }, { $project: { paymentId: '$_id', chargeId: '$allocations.chargeId' } }]),
    Resident.aggregate([{ $match: { rentSchedules: { $size: 0 } } }, { $count: 'count' }]),
  ]);
  const [charges, payments, residents] = await Promise.all([
    Charge.find().select('_id residentId kind periodKey description amountPaise paidPaise dueAt issuedAt createdAt status scheduleVersion').lean(),
    Payment.find().select('_id residentId amountPaise paymentDate method reference allocations reversedAt createdAt').lean(),
    Resident.find().select('_id residentId admissionDate billingStartDate effectiveEndDate status rentSchedules').lean(),
  ]);
  const auditEvents = await AuditEvent.find({ $or: [{ entityType: 'Charge', entityId: { $in: charges.map((charge) => String(charge._id)) } }, { entityType: 'Payment', entityId: { $in: payments.map((payment) => String(payment._id)) } }] }).select('entityType entityId action reason details actorId createdAt').sort({ createdAt: 1 }).lean();
  const statusMismatches = charges.filter((charge) => charge.status !== ledgerForCharge(charge).status).map((charge) => ({ chargeId: String(charge._id), kind: charge.kind, periodKey: charge.periodKey, storedStatus: charge.status, derivedStatus: ledgerForCharge(charge).status }));
  console.log(JSON.stringify({ mode: 'READ_ONLY', totals: { residents: residentCount, charges: chargeCount, payments: paymentCount, roomAllocations: allocationCount, depositTransactions: depositsCount, residentMigrations: migrationCount }, ledgerTrace: { residents, charges, payments, auditEvents }, findings: { duplicateRentChargeGroups: duplicateRent.length, duplicateRent, orphanCharges: orphanCharges[0]?.count ?? 0, chargePaidVsActiveAllocationMismatches: chargeLedger.length, chargeLedger: chargeLedger.slice(0, 100), storedVsDerivedChargeStatusMismatches: statusMismatches, reversedPayments: paymentAudit[0]?.count ?? 0, orphanPayments: orphanPayments[0]?.count ?? 0, paymentChargeResidentMismatches: paymentResidentMismatch.length, paymentResidentMismatch: paymentResidentMismatch.slice(0, 100), overAllocatedPayments: overAllocatedPayments.length, overAllocationDetails: overAllocatedPayments.slice(0, 100), paymentsWithUnallocatedBalance: unallocatedPayments.length, unallocatedPaymentDetails: unallocatedPayments.slice(0, 100), allocationsToMissingCharges: allocationAudit.length, allocationAudit: allocationAudit.slice(0, 100), residentsWithoutRentSchedule: residentsWithoutSchedule[0]?.count ?? 0 } }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : 'Diagnostic failed'); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); });
