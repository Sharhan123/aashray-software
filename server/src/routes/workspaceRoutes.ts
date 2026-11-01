import { asyncHandler } from '../middleware/asyncHandler.js';
import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import argon2 from 'argon2';
import { User, STAFF_PERMISSIONS, type Permission } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Room } from '../models/Room.js';
import { RoomAllocation } from '../models/RoomAllocation.js';
import { Property } from '../models/Property.js';
import { Resident } from '../models/Resident.js';
import { Charge } from '../models/Charge.js';
import { Payment } from '../models/Payment.js';
import { DepositTransaction } from '../models/DepositTransaction.js';
import { ResidentMigration } from '../models/ResidentMigration.js';
import { MessageLog } from '../models/MessageLog.js';
import { AppSettings } from '../models/AppSettings.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { OwnerReminder } from '../models/OwnerReminder.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { chargeBalance, chargeLedger, rentChargeLedger } from '../services/financialCalculations.js';
import { billingCycleStartDate, billingDayForDate, periodKeyFor } from '../services/billingRules.js';
import { businessMonthRange, classifyRentCharge, rentChargeMongoFilter, summarizeRentCharges } from '../services/rentStatus.js';
import { residentIsInScope, scopedResidentIds, scopedRoomIds } from '../middleware/propertyAccess.js';

const router = Router(); router.use(requireAuth);
const legacyRentReminderTemplate = 'Hello {residentName}, there is a rent due of {amount} from Aashray Paying Guest for {month}. Please pay it within 5 days of the due date ({dueDate}). Thank you.';
const defaultRentReminderTemplate = 'Dear {residentName}, 😊\n\nThis is a gentle reminder that rent of {amount} for the period {periodStart} to {periodEnd} is due on {dueDate}. Kindly clear your dues at the earliest.\n\n📌 Important Notes:\n• Rent must be paid within 5 days of the due date. Late charges of ₹50 per day apply from {lateFeeStart}.\n• 30 days’ prior notice is mandatory before vacating.\n\nPlease ignore this message if you have already paid.\n\nThank you for your cooperation! 🙏\n– Aashray Paying Guest';
const safeUser = (user: { id?: string; name: string; email: string; role: string; active: boolean; permissions: string[]; propertyIds?: unknown[]; lastLoginAt?: Date | null; createdAt?: Date }) => ({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, permissions: user.permissions, propertyIds: (user.propertyIds ?? []).map(String), lastLoginAt: user.lastLoginAt, createdAt: user.createdAt });

router.get('/dashboard', requirePermission('dashboard:read'), asyncHandler(async (req, res) => {
  const now = new Date(); const { start: monthStart, end: monthEnd } = businessMonthRange(now); const currentPeriod = periodKeyFor(now);
  const residentScope = await scopedResidentIds(req); const roomScope = await scopedRoomIds(req);
  const residentFilter = residentScope.ids === null ? {} : { _id: { $in: residentScope.ids } };
  const chargeResidentFilter = residentScope.ids === null ? {} : { residentId: { $in: residentScope.ids } };
  const paymentResidentFilter = residentScope.ids === null ? {} : { residentId: { $in: residentScope.ids } };
  const roomMatch = roomScope.ids === null ? {} : { _id: { $in: roomScope.ids } };
  const rentBalanceExpr = { $max: [0, { $subtract: ['$amountPaise', { $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }] }] };
  const rentOverdueFilter = { kind: 'RENT', periodKey: currentPeriod, ...rentChargeMongoFilter('OVERDUE', now) };
  const pastDueFilter = { kind: 'RENT', periodKey: { $lt: currentPeriod }, $expr: { $gt: [rentBalanceExpr, 0] } };
  const [activeResidents, totalBeds, occupiedBeds, rentBilled, rentCollected, externalRentCollected, balances, rentOutstanding, openingOutstanding, overdueBalances, overdueResidentIds, pastDueBalances, pastDueResidentIds, dueGraceBalances, dueGraceResidentIds, utilityPending, securityDepositsHeld, upcomingDues, recentPayments, recentAdmissions] = await Promise.all([
    Resident.countDocuments({ ...residentFilter, status: 'ACTIVE' }), Room.aggregate([{ $match: { active: true, ...roomMatch } }, { $group: { _id: null, total: { $sum: '$capacity' } } }]), RoomAllocation.countDocuments({ active: true, ...(roomScope.ids === null ? {} : { roomId: { $in: roomScope.ids } }) }),
    Charge.aggregate([{ $match: { kind: 'RENT', periodKey: currentPeriod, ...chargeResidentFilter } }, { $group: { _id: null, total: { $sum: '$amountPaise' } } }]),
    Payment.aggregate([{ $match: { paymentDate: { $gte: monthStart, $lt: monthEnd }, reversedAt: null, ...paymentResidentFilter } }, { $unwind: '$allocations' }, { $lookup: { from: 'charges', localField: 'allocations.chargeId', foreignField: '_id', as: 'charge' } }, { $unwind: '$charge' }, { $match: { 'charge.kind': 'RENT' } }, { $group: { _id: null, total: { $sum: '$allocations.amountPaise' } } }]),
    ResidentMigration.aggregate([{ $match: { periodKey: periodKeyFor(now), ...chargeResidentFilter } }, { $group: { _id: null, total: { $sum: '$currentPeriodSettledPaise' } } }]),
    Charge.aggregate([{ $match: chargeResidentFilter }, { $group: { _id: '$kind', amount: { $sum: rentBalanceExpr } } }]),
    Charge.aggregate([{ $match: { kind: 'RENT', ...chargeResidentFilter, $expr: { $gt: [rentBalanceExpr, 0] } } }, { $group: { _id: null, total: { $sum: rentBalanceExpr } } }]),
    Charge.aggregate([{ $match: { kind: 'OPENING_BALANCE', ...chargeResidentFilter, $expr: { $gt: [rentBalanceExpr, 0] } } }, { $group: { _id: null, total: { $sum: rentBalanceExpr } } }]),
    Charge.aggregate([{ $match: { ...rentOverdueFilter, ...chargeResidentFilter } }, { $group: { _id: null, total: { $sum: rentBalanceExpr } } }]),
    Charge.distinct('residentId', { ...rentOverdueFilter, ...chargeResidentFilter }),
    Charge.aggregate([{ $match: { ...pastDueFilter, ...chargeResidentFilter } }, { $group: { _id: null, total: { $sum: rentBalanceExpr } } }]),
    Charge.distinct('residentId', { ...pastDueFilter, ...chargeResidentFilter }),
    Charge.aggregate([{ $match: { kind: 'RENT', periodKey: currentPeriod, ...rentChargeMongoFilter('DUE_GRACE', now), ...chargeResidentFilter } }, { $group: { _id: null, total: { $sum: rentBalanceExpr } } }]),
    Charge.distinct('residentId', { kind: 'RENT', periodKey: currentPeriod, ...rentChargeMongoFilter('DUE_GRACE', now), ...chargeResidentFilter }),
    Charge.aggregate([{ $match: { kind: 'UTILITY', ...chargeResidentFilter, $expr: { $lt: [{ $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }, '$amountPaise'] } } }, { $group: { _id: null, total: { $sum: { $max: [0, { $subtract: ['$amountPaise', { $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }] }] } } } }]),
    DepositTransaction.aggregate([
      { $match: chargeResidentFilter },
      { $group: { _id: '$residentId', balancePaise: { $sum: { $switch: { branches: [{ case: { $eq: ['$kind', 'RECEIVED'] }, then: '$amountPaise' }, { case: { $in: ['$kind', ['REFUNDED', 'APPLIED']] }, then: { $multiply: ['$amountPaise', -1] } }], default: 0 } } } } },
      { $group: { _id: null, total: { $sum: { $max: [0, '$balancePaise'] } } } },
    ]),
    Charge.find({ kind: 'RENT', ...rentChargeMongoFilter('UPCOMING', now), ...chargeResidentFilter }).populate('residentId', 'residentId fullName').sort({ dueAt: 1 }).limit(8).lean(),
    Payment.find({ reversedAt: null, ...paymentResidentFilter }).populate('residentId', 'residentId fullName').sort({ createdAt: -1, _id: -1 }).limit(8).lean(), Resident.find(residentFilter).sort({ admissionDate: -1 }).limit(8).select('residentId fullName admissionDate').lean(),
  ]);
  const [properties, activeRooms, activeGenderCounts] = await Promise.all([
    Property.find(req.user!.role === 'SUPER_ADMIN' ? {} : { _id: { $in: req.user!.propertyIds ?? [] } }).select('_id gender').lean(),
    Room.find({ active: true, ...roomMatch }).select('_id propertyId capacity').lean(),
    Resident.aggregate([{ $match: { ...residentFilter, status: 'ACTIVE' } }, { $group: { _id: { $ifNull: ['$gender', 'UNASSIGNED'] }, count: { $sum: 1 } } }]),
  ]);
  const propertyGenderById = new Map(properties.map((property) => [String(property._id), property.gender ?? 'UNASSIGNED']));
  const roomById = new Map(activeRooms.map((room) => [String(room._id), room]));
  const genderBeds = {
    MALE: { totalBeds: 0, occupiedBeds: 0 },
    FEMALE: { totalBeds: 0, occupiedBeds: 0 },
    UNASSIGNED: { totalBeds: 0, occupiedBeds: 0 },
  };
  for (const room of activeRooms) {
    const gender = propertyGenderById.get(String(room.propertyId ?? ''));
    const key = gender === 'MALE' || gender === 'FEMALE' ? gender : 'UNASSIGNED';
    genderBeds[key].totalBeds += room.capacity;
  }
  const genderAllocations = await RoomAllocation.find({ active: true, roomId: { $in: activeRooms.map((room) => room._id) } }).select('roomId').lean();
  for (const allocation of genderAllocations) {
    const room = roomById.get(String(allocation.roomId));
    if (!room) continue;
    const gender = propertyGenderById.get(String(room.propertyId ?? ''));
    const key = gender === 'MALE' || gender === 'FEMALE' ? gender : 'UNASSIGNED';
    genderBeds[key].occupiedBeds += 1;
  }
  const genderResidentCounts = { MALE: 0, FEMALE: 0, UNASSIGNED: 0 };
  for (const row of activeGenderCounts) {
    const key: keyof typeof genderResidentCounts = row._id === 'MALE' || row._id === 'FEMALE' ? row._id : 'UNASSIGNED';
    genderResidentCounts[key] = row.count;
  }
  const genderBreakdown = Object.fromEntries((['MALE', 'FEMALE', 'UNASSIGNED'] as const).map((gender) => [gender, {
    activeResidents: genderResidentCounts[gender],
    totalBeds: genderBeds[gender].totalBeds,
    occupiedBeds: genderBeds[gender].occupiedBeds,
    vacantBeds: Math.max(0, genderBeds[gender].totalBeds - genderBeds[gender].occupiedBeds),
  }]));
  const legacyRent = balances.filter((x) => x._id === 'RENT' || x._id === 'OPENING_BALANCE').reduce((sum, charge) => sum + charge.amount, 0);
  const rentFollowUpIds = [...new Set([...overdueResidentIds.slice(0, 4), ...dueGraceResidentIds.slice(0, 4)].map(String))];
  const rentFollowUpResidents = await Resident.find({ _id: { $in: rentFollowUpIds }, status: { $in: ['ACTIVE', 'NOTICE'] } }).select('_id residentId fullName').limit(8).lean();
  const rentFollowUpChargeFilter = { kind: 'RENT', periodKey: currentPeriod, $or: [rentChargeMongoFilter('OVERDUE', now), rentChargeMongoFilter('DUE_GRACE', now)] };
  const rentFollowUpChargeRows = rentFollowUpResidents.length ? await Charge.find({ residentId: { $in: rentFollowUpResidents.map((resident) => resident._id) }, ...rentFollowUpChargeFilter }).sort({ dueAt: 1 }).lean() : [];
  const allocations = await RoomAllocation.find({ residentId: { $in: rentFollowUpResidents.map((resident) => resident._id) }, active: true }).populate('roomId', 'roomNumber propertyName').lean();
  const allocationByResident = new Map(allocations.map((allocation) => [String(allocation.residentId), allocation]));
  const rentFollowUps = rentFollowUpResidents.map((resident) => {
    const residentCharges = rentFollowUpChargeRows.filter((charge) => String(charge.residentId) === String(resident._id));
    const rentSummary = summarizeRentCharges(residentCharges, now);
    const allocation = allocationByResident.get(String(resident._id));
    const room = allocation?.roomId as unknown as { roomNumber?: string; propertyName?: string } | null;
    return { residentId: String(resident._id), residentCode: resident.residentId, fullName: resident.fullName, outstandingRentPaise: rentSummary.balancePaise, dueAt: rentSummary.dueAt, daysPastDue: rentSummary.daysPastDue, rentStatus: rentSummary.status, roomNumber: room?.roomNumber ?? '', bedId: allocation?.bedId ?? '', propertyName: room?.propertyName ?? '' };
  });
  return res.json({ period: { start: monthStart, end: monthEnd, periodKey: currentPeriod }, metrics: { activeResidents, totalBeds: totalBeds[0]?.total ?? 0, occupiedBeds, availableBeds: Math.max(0, (totalBeds[0]?.total ?? 0) - occupiedBeds), genderBreakdown, rentBilledPaise: rentBilled[0]?.total ?? 0, rentCollectedPaise: (rentCollected[0]?.total ?? 0) + (externalRentCollected[0]?.total ?? 0), outstandingRentPaise: legacyRent, totalOutstandingRentPaise: rentOutstanding[0]?.total ?? 0, openingBalanceOutstandingPaise: openingOutstanding[0]?.total ?? 0, overdueRentPaise: overdueBalances[0]?.total ?? 0, overdueRentResidentCount: overdueResidentIds.length, pastDueRentPaise: pastDueBalances[0]?.total ?? 0, pastDueRentResidentCount: pastDueResidentIds.length, dueGraceRentPaise: dueGraceBalances[0]?.total ?? 0, dueGraceRentResidentCount: dueGraceResidentIds.length, pendingUtilityPaise: utilityPending[0]?.total ?? 0, securityDepositsHeldPaise: securityDepositsHeld[0]?.total ?? 0 }, rentFollowUps, upcomingDues, recentPayments, recentAdmissions });
}));

router.get('/dashboard/rent-summary', requirePermission('dashboard:read'), asyncHandler(async (req, res) => {
  const currentPeriod = periodKeyFor(new Date());
  const periodKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().parse(req.query.periodKey) ?? currentPeriod;
  const scope = await scopedResidentIds(req);
  const residentFilter = scope.ids === null ? {} : { residentId: { $in: scope.ids } };
  const [billedRows, migrationRows, periodRows] = await Promise.all([
    Charge.find({ kind: 'RENT', periodKey, ...residentFilter }).populate('residentId', 'residentId fullName').lean(),
    ResidentMigration.find(residentFilter).select('residentId periodKey monthlyRentPaise currentPeriodSettledPaise').lean(),
    Charge.aggregate([
      { $match: { kind: 'RENT', ...residentFilter } },
      { $group: { _id: '$periodKey', billedPaise: { $sum: '$amountPaise' }, collectedPaise: { $sum: { $min: ['$amountPaise', { $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }] } }, outstandingPaise: { $sum: { $max: [0, { $subtract: ['$amountPaise', { $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }] }] } } } },
      { $sort: { _id: -1 } },
    ]),
  ]);
  const migrationChargePairs = migrationRows.length ? await Charge.find({ kind: 'RENT', $or: migrationRows.map((migration) => ({ residentId: migration.residentId, periodKey: migration.periodKey })) }).select('residentId periodKey').lean() : [];
  const migrationChargePairKeys = new Set(migrationChargePairs.map((charge) => `${String(charge.residentId)}:${charge.periodKey}`));
  const rowsByResident = new Map<string, { residentObjectId: string; residentId: string; name: string; billedPaise: number; collectedPaise: number; outstandingPaise: number; dueAt: string | null; status: string }>();
  const getRow = (id: string, residentId = '', name = '') => {
    let row = rowsByResident.get(id);
    if (!row) { row = { residentObjectId: id, residentId, name, billedPaise: 0, collectedPaise: 0, outstandingPaise: 0, dueAt: null, status: 'UNBILLED' }; rowsByResident.set(id, row); }
    else { if (residentId) row.residentId = residentId; if (name) row.name = name; }
    return row;
  };
  for (const charge of billedRows) {
    const resident = charge.residentId as unknown as { _id: Types.ObjectId; residentId?: string; fullName?: string } | null;
    if (!resident) continue;
    const row = getRow(String(resident._id), resident.residentId ?? '', resident.fullName ?? '');
    const collectedPaise = Math.min(charge.amountPaise, charge.paidPaise + (charge.externalPaidPaise ?? 0));
    row.billedPaise += charge.amountPaise;
    row.collectedPaise += collectedPaise;
    row.outstandingPaise += Math.max(0, charge.amountPaise - collectedPaise);
    row.dueAt = charge.dueAt.toISOString();
    row.status = classifyRentCharge(charge, new Date()).status;
  }
  for (const migration of migrationRows) {
    if (migration.periodKey !== periodKey || rowsByResident.has(String(migration.residentId))) continue;
    const row = getRow(String(migration.residentId));
    row.billedPaise = migration.monthlyRentPaise;
    row.collectedPaise = Math.min(migration.monthlyRentPaise, migration.currentPeriodSettledPaise);
    row.outstandingPaise = Math.max(0, row.billedPaise - row.collectedPaise);
    row.status = row.outstandingPaise === 0 ? 'CLEARED' : 'MIGRATED';
  }
  const residentIds = [...rowsByResident.keys()].filter((id) => !rowsByResident.get(id)?.name);
  if (residentIds.length) {
    const residents = await Resident.find({ _id: { $in: residentIds } }).select('residentId fullName').lean();
    for (const resident of residents) getRow(String(resident._id), resident.residentId, resident.fullName);
  }
  const rows = [...rowsByResident.values()].sort((a, b) => a.name.localeCompare(b.name));
  const periodsByKey = new Map<string, { periodKey: string; billedPaise: number; collectedPaise: number; outstandingPaise: number }>(periodRows.map((row) => [String(row._id), { periodKey: String(row._id), billedPaise: Number(row.billedPaise), collectedPaise: Number(row.collectedPaise), outstandingPaise: Number(row.outstandingPaise) }]));
  for (const migration of migrationRows) {
    if (migrationChargePairKeys.has(`${String(migration.residentId)}:${migration.periodKey}`)) continue;
    const period = periodsByKey.get(migration.periodKey) ?? { periodKey: migration.periodKey, billedPaise: 0, collectedPaise: 0, outstandingPaise: 0 };
    const collectedPaise = Math.min(migration.monthlyRentPaise, migration.currentPeriodSettledPaise);
    period.billedPaise += migration.monthlyRentPaise;
    period.collectedPaise += collectedPaise;
    period.outstandingPaise += Math.max(0, migration.monthlyRentPaise - collectedPaise);
    periodsByKey.set(migration.periodKey, period);
  }
  const periods = [...periodsByKey.values()].sort((a, b) => b.periodKey.localeCompare(a.periodKey));
  return res.json({ periodKey, rows, periods, totals: { billedPaise: rows.reduce((sum, row) => sum + row.billedPaise, 0), collectedPaise: rows.reduce((sum, row) => sum + row.collectedPaise, 0), outstandingPaise: rows.reduce((sum, row) => sum + row.outstandingPaise, 0) } });
}));

router.get('/reminders', requireRole('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const activeOnly = req.query.active === 'true';
  const reminders = await OwnerReminder.find(activeOnly ? { active: true } : {}).sort({ active: -1, dueAt: 1 }).limit(500).lean();
  return res.json({ reminders });
}));
router.get('/reminders/due', requireRole('SUPER_ADMIN'), asyncHandler(async (_req, res) => {
  const reminders = await OwnerReminder.find({ active: true, dueAt: { $lte: new Date() } }).sort({ dueAt: 1 }).limit(20).lean();
  return res.json({ reminders });
}));
router.post('/reminders', requireRole('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const input = z.object({ title: z.string().trim().min(1).max(160), notes: z.string().trim().max(2000).default(''), dueAt: z.string().datetime(), repeatEveryHours: z.number().int().min(1).max(8760).nullable().default(null) }).parse(req.body);
  const reminder = await OwnerReminder.create({ ...input, dueAt: new Date(input.dueAt), createdBy: req.user!.id });
  await AuditEvent.create({ actorId: req.user!.id, action: 'OWNER_REMINDER_CREATED', entityType: 'OwnerReminder', entityId: String(reminder._id), details: { repeatEveryHours: reminder.repeatEveryHours } });
  return res.status(201).json({ reminder });
}));
router.post('/reminders/:id/acknowledge', requireRole('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const reminderId = req.params.id;
  if (typeof reminderId !== 'string' || !Types.ObjectId.isValid(reminderId)) return res.status(404).json({ error: 'Reminder not found.' });
  const reminder = await OwnerReminder.findById(reminderId);
  if (!reminder || !reminder.active) return res.status(404).json({ error: 'Reminder not found.' });
  const now = new Date();
  if (reminder.repeatEveryHours) {
    const intervalMs = reminder.repeatEveryHours * 60 * 60 * 1000;
    const missedIntervals = Math.floor(Math.max(0, now.getTime() - reminder.dueAt.getTime()) / intervalMs) + 1;
    reminder.dueAt = new Date(reminder.dueAt.getTime() + missedIntervals * intervalMs);
  } else {
    reminder.active = false;
    reminder.completedAt = now;
  }
  await reminder.save();
  await AuditEvent.create({ actorId: req.user!.id, action: 'OWNER_REMINDER_ACKNOWLEDGED', entityType: 'OwnerReminder', entityId: String(reminder._id) });
  return res.json({ reminder });
}));
router.post('/reminders/:id/snooze', requireRole('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const reminderId = req.params.id;
  if (typeof reminderId !== 'string' || !Types.ObjectId.isValid(reminderId)) return res.status(404).json({ error: 'Reminder not found.' });
  const { minutes } = z.object({ minutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30), z.literal(60), z.literal(120)]) }).parse(req.body);
  const reminder = await OwnerReminder.findOne({ _id: reminderId, active: true });
  if (!reminder) return res.status(404).json({ error: 'Reminder not found.' });
  reminder.dueAt = new Date(Date.now() + minutes * 60_000);
  await reminder.save();
  await AuditEvent.create({ actorId: req.user!.id, action: 'OWNER_REMINDER_SNOOZED', entityType: 'OwnerReminder', entityId: String(reminder._id), details: { minutes } });
  return res.json({ reminder });
}));
router.post('/reminders/:id/stop', requireRole('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const reminderId = req.params.id;
  if (typeof reminderId !== 'string' || !Types.ObjectId.isValid(reminderId)) return res.status(404).json({ error: 'Reminder not found.' });
  const reminder = await OwnerReminder.findOne({ _id: reminderId, active: true });
  if (!reminder) return res.status(404).json({ error: 'Reminder not found.' });
  reminder.active = false;
  reminder.completedAt = new Date();
  reminder.stoppedAt = reminder.completedAt;
  await reminder.save();
  await AuditEvent.create({ actorId: req.user!.id, action: 'OWNER_REMINDER_STOPPED', entityType: 'OwnerReminder', entityId: String(reminder._id) });
  return res.json({ reminder });
}));
router.delete('/reminders/:id', requireRole('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const reminderId = req.params.id;
  if (typeof reminderId !== 'string' || !Types.ObjectId.isValid(reminderId)) return res.status(404).json({ error: 'Reminder not found.' });
  const reminder = await OwnerReminder.findByIdAndDelete(reminderId);
  if (!reminder) return res.status(404).json({ error: 'Reminder not found.' });
  await AuditEvent.create({ actorId: req.user!.id, action: 'OWNER_REMINDER_DELETED', entityType: 'OwnerReminder', entityId: String(reminder._id) });
  return res.status(204).end();
}));

router.get('/staff', requirePermission('staff:read'), asyncHandler(async (_req, res) => {
  const staff = await User.find({ role: 'STAFF' }).sort({ createdAt: -1 }).lean(); return res.json({ staff: staff.map((u) => safeUser({ ...u, id: String(u._id) })) });
}));
router.post('/staff', requirePermission('staff:write'), requireRole('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const data = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254), password: z.string().min(14).max(200), permissions: z.array(z.enum(STAFF_PERMISSIONS)).default([]), propertyIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).default([]) }).parse(req.body);
  const propertyIds = [...new Set(data.propertyIds)];
  const email = data.email.toLowerCase();
  if (await User.exists({ email })) return res.status(409).json({ error: 'A user with this email already exists.' });
  const allowedProperties = await (await import('../models/Property.js')).Property.countDocuments({ _id: { $in: propertyIds }, active: true });
  if (allowedProperties !== propertyIds.length) return res.status(422).json({ error: 'Choose only active properties.' });
  let staff;
  try {
    staff = await User.create({ ...data, propertyIds, email, role: 'STAFF', active: true, permissions: data.permissions, passwordHash: await argon2.hash(data.password, { type: argon2.argon2id }) });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return res.status(409).json({ error: 'A user with this email already exists.' });
    throw error;
  }
  await AuditEvent.create({ actorId: req.user!.id, action: 'STAFF_CREATED', entityType: 'User', entityId: String(staff._id), details: { permissions: staff.permissions, propertyIds: propertyIds.map(String) } });
  return res.status(201).json({ staff: safeUser({ ...staff.toObject(), id: String(staff._id) }) });
}));
router.patch('/staff/:id', requirePermission('staff:write'), requireRole('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const data = z.object({ active: z.boolean().optional(), permissions: z.array(z.enum(STAFF_PERMISSIONS)).optional(), propertyIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).optional() }).refine((d) => d.active !== undefined || d.permissions !== undefined || d.propertyIds !== undefined).parse(req.body);
  const staff = await User.findOne({ _id: req.params.id, role: 'STAFF' }); if (!staff) return res.status(404).json({ error: 'Staff account not found.' });
  const propertyIds = data.propertyIds === undefined ? undefined : [...new Set(data.propertyIds)];
  if (propertyIds) {
    const activeProperties = await (await import('../models/Property.js')).Property.countDocuments({ _id: { $in: propertyIds }, active: true });
    if (activeProperties !== propertyIds.length) return res.status(422).json({ error: 'Choose only active properties.' });
    staff.propertyIds = propertyIds.map((id) => new Types.ObjectId(id));
  }
  if (data.active !== undefined) staff.active = data.active; if (data.permissions) staff.permissions = data.permissions as Permission[]; await staff.save();
  if (!staff.active) await Session.deleteMany({ userId: staff._id });
  await AuditEvent.create({ actorId: req.user!.id, action: 'STAFF_UPDATED', entityType: 'User', entityId: String(staff._id), details: { active: staff.active, permissions: staff.permissions, propertyIds: staff.propertyIds.map(String) } });
  return res.json({ staff: safeUser({ ...staff.toObject(), id: String(staff._id) }) });
}));
router.post('/staff/:id/reset-password', requirePermission('staff:write'), requireRole('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const { password } = z.object({ password: z.string().min(14).max(200) }).parse(req.body);
  const staff = await User.findOne({ _id: req.params.id, role: 'STAFF' }).select('+passwordHash'); if (!staff) return res.status(404).json({ error: 'Staff account not found.' });
  staff.passwordHash = await argon2.hash(password, { type: argon2.argon2id }); await staff.save(); await Session.deleteMany({ userId: staff._id });
  await AuditEvent.create({ actorId: req.user!.id, action: 'STAFF_PASSWORD_RESET', entityType: 'User', entityId: String(staff._id) }); return res.status(204).end();
}));

router.get('/settings', requirePermission('settings:read'), asyncHandler(async (_req, res) => {
  const settings = await AppSettings.findOneAndUpdate({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
  return res.json({ settings: { ...settings, whatsappConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && settings.whatsappPhoneNumberId), whatsappAccessToken: undefined } });
}));
router.put('/settings', requirePermission('settings:write'), requireRole('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const data = z.object({ businessName: z.string().trim().min(2).max(160), contactPhone: z.string().max(30), contactEmail: z.string().email().or(z.literal('')), timezone: z.literal('Asia/Kolkata'), reminderOffsets: z.array(z.number().int().min(-30).max(30)).max(10), paymentMethods: z.array(z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'OTHER'])).min(1), utilityTypes: z.array(z.string().trim().min(2).max(60)).max(20), rentReminderTemplate: z.string().trim().min(20).max(1000).optional(), whatsappPhoneNumberId: z.string().max(100), whatsappBusinessAccountId: z.string().max(100), whatsappAutoRemindersEnabled: z.boolean() }).parse(req.body);
  if (data.whatsappAutoRemindersEnabled) return res.status(422).json({ error: 'Automated WhatsApp delivery stays disabled until an audited template, recipient consent, webhook, and delivery workflow are configured.' });
  const { rentReminderTemplate, ...settingsData } = data;
  const settings = await AppSettings.findOneAndUpdate({ key: 'main' }, { $set: { ...settingsData, ...(rentReminderTemplate === undefined ? {} : { rentReminderTemplate }), whatsappEnabled: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && data.whatsappPhoneNumberId) } }, { new: true, upsert: true, runValidators: true }).lean();
  await AuditEvent.create({ actorId: req.user!.id, action: 'SETTINGS_UPDATED', entityType: 'AppSettings', entityId: 'main' });
  return res.json({ settings: { ...settings, whatsappConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && settings.whatsappPhoneNumberId), whatsappAccessToken: undefined } });
}));

router.post('/messages/prepare', requirePermission('messages:send'), asyncHandler(async (req, res) => {
  const data = z.object({ residentId: z.string().regex(/^[a-f\d]{24}$/i), propertyId: z.string().regex(/^[a-f\d]{24}$/i).optional(), messageType: z.enum(['RENT_REMINDER', 'OVERDUE', 'UTILITY', 'CUSTOM']), customMessage: z.string().max(4000).default('') }).parse(req.body);
  const resident = await Resident.findById(data.residentId).lean(); if (!resident) return res.status(404).json({ error: 'Resident not found.' });
  if (!await residentIsInScope(req, data.residentId)) return res.status(403).json({ error: 'You do not have access to this resident’s property.' });
  if (data.propertyId && req.user?.role !== 'SUPER_ADMIN' && !(req.user?.propertyIds ?? []).includes(data.propertyId)) return res.status(403).json({ error: 'You do not have access to this property.' });
  let propertyName = 'Aashray Hospitality';
  if (data.propertyId) {
    const property = await (await import('../models/Property.js')).Property.findOne({ _id: data.propertyId, active: true }).lean();
    const roomIds = await Room.distinct('_id', { propertyId: data.propertyId });
    if (!property || !await RoomAllocation.exists({ residentId: resident._id, roomId: { $in: roomIds }, active: true })) return res.status(422).json({ error: 'Choose a resident currently assigned to this property.' });
    propertyName = property.name;
  }
  let message = data.customMessage.trim();
  if (data.messageType !== 'CUSTOM') {
    const onlyOverdue = data.messageType === 'OVERDUE' || data.messageType === 'UTILITY';
    const overdueRentFilter = data.messageType === 'OVERDUE' ? rentChargeMongoFilter('OVERDUE') : {};
    const charges = await Charge.find({ residentId: resident._id, ...(data.messageType === 'UTILITY' ? { kind: 'UTILITY', ...(onlyOverdue ? { dueAt: { $lt: new Date() } } : {}) } : { kind: 'RENT', ...(data.messageType === 'OVERDUE' ? overdueRentFilter : {}), $expr: { $lt: [{ $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }, '$amountPaise'] } }) }).sort({ dueAt: 1 }).lean();
    if (!charges.length) return res.status(422).json({ error: onlyOverdue ? 'There are no overdue unpaid charges of this type for this resident.' : 'There are no unpaid charges of this type to remind this resident about.' });
    const balance = charges.reduce((sum, c) => sum + chargeBalance(c), 0);
    const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(balance / 100);
    const formatReminderDate = (date: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' }).format(date);
    const due = charges[0]?.dueAt ? formatReminderDate(charges[0].dueAt) : 'your upcoming due date';
    const rentCycles = charges.flatMap((charge) => {
      if (!/^\d{4}-\d{2}$/.test(charge.periodKey ?? '')) return [];
      const schedule = resident.rentSchedules.find((entry) => entry.version === charge.scheduleVersion)
        ?? [...resident.rentSchedules].sort((a, b) => b.version - a.version)[0];
      const dueDay = schedule?.dueDay ?? billingDayForDate(resident.admissionDate);
      const [year = 2000, month = 1] = charge.periodKey!.split('-').map(Number);
      const nextMonthDate = new Date(Date.UTC(year, month, 1));
      const nextPeriodKey = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, '0')}`;
      const start = billingCycleStartDate(charge.periodKey!, dueDay);
      const end = billingCycleStartDate(nextPeriodKey, dueDay);
      end.setUTCDate(end.getUTCDate() - 1);
      return [{ start, end }];
    }).sort((a, b) => a.start.getTime() - b.start.getTime());
    const periodStart = rentCycles.length ? formatReminderDate(rentCycles[0]!.start) : 'the current billing period';
    const periodEnd = rentCycles.length ? formatReminderDate(rentCycles.at(-1)!.end) : 'the end of the billing period';
    const lateFeeDate = charges[0]?.dueAt ? new Date(charges[0].dueAt) : null;
    if (lateFeeDate) lateFeeDate.setUTCDate(lateFeeDate.getUTCDate() + 6);
    const periods = [...new Set(charges.map((charge) => charge.periodKey).filter(Boolean))];
    const period = data.messageType === 'UTILITY'
      ? [...new Set(charges.map((charge) => charge.servicePeriodStart && charge.servicePeriodEnd
        ? `${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(charge.servicePeriodStart)} to ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(charge.servicePeriodEnd)}`
        : charge.periodKey).filter(Boolean))].join(', ')
      : periods.map((key) => {
      const match = /^(\d{4})-(\d{2})$/.exec(key);
      if (!match) return key === 'OPENING' || key.startsWith('OPENING-') ? 'an earlier billing period' : key;
      const year = Number(match[1]); const month = Number(match[2]);
      return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
    }).join(', ');
    if (data.messageType === 'OVERDUE' || data.messageType === 'RENT_REMINDER') {
      const settings = await AppSettings.findOne({ key: 'main' }).lean();
      const savedTemplate = settings?.rentReminderTemplate?.trim();
      const template = !savedTemplate || savedTemplate === legacyRentReminderTemplate ? defaultRentReminderTemplate : savedTemplate;
      const values: Record<string, string> = { residentName: resident.fullName, amount, month: period || 'the current billing period', dueDate: due, periodStart, periodEnd, lateFeeStart: lateFeeDate ? formatReminderDate(lateFeeDate) : 'the sixth day after the due date', property: propertyName };
      message = template.replace(/\{(residentName|amount|month|dueDate|periodStart|periodEnd|lateFeeStart|property)\}/g, (_token, key: string) => values[key] ?? '');
    } else {
      message = `Hello ${resident.fullName}, your pending utility balance at ${propertyName} is ${amount}${period ? ` for ${period}` : ''}, due ${due}. Please clear the amount within 5 days. If you have already paid, please ignore this reminder. Thank you.`;
    }
  }
  if (!message) return res.status(422).json({ error: 'Enter a message to prepare.' });
  const log = await MessageLog.create({ residentId: resident._id, authorId: req.user!.id, recipient: resident.mobile, messageType: data.messageType, message, deliveryMechanism: 'WHATSAPP_CLICK_TO_CHAT', status: 'PREPARED' });
  const digits = resident.mobile.replace(/\D/g, '').replace(/^0+/, ''); const phone = digits.length === 10 ? `91${digits}` : digits;
  return res.status(201).json({ message: log, whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` });
}));
router.post('/messages/:id/opened', requirePermission('messages:send'), asyncHandler(async (req, res) => {
  const existing = await MessageLog.findById(req.params.id); if (!existing) return res.status(404).json({ error: 'Message record not found.' });
  if (!await residentIsInScope(req, String(existing.residentId))) return res.status(403).json({ error: 'You do not have access to this resident’s property.' });
  const message = await MessageLog.findByIdAndUpdate(req.params.id, { $set: { status: 'OPENED_MANUALLY', openedAt: new Date() } }, { new: true });
  if (!message) return res.status(404).json({ error: 'Message record not found.' }); return res.json({ message });
}));
router.get('/messages', requirePermission('messages:read'), asyncHandler(async (req, res) => {
  const filter: Record<string, unknown> = {};
  const requestedPropertyId = req.query.propertyId && /^[a-f\d]{24}$/i.test(String(req.query.propertyId)) ? String(req.query.propertyId) : undefined;
  const scope = await scopedResidentIds(req, requestedPropertyId);
  if (scope.forbidden) return res.status(403).json({ error: 'You do not have access to this property.' });
  if (scope.ids !== null) filter.residentId = { $in: scope.ids };
  const messages = await MessageLog.find(filter).populate('residentId', 'residentId fullName').populate('authorId', 'name').sort({ createdAt: -1 }).limit(200).lean(); return res.json({ messages });
}));

router.get('/reports/:name', requirePermission('reports:read'), asyncHandler(async (req, res) => {
  const name = z.enum(['residents', 'occupancy', 'rent', 'overdue', 'collections', 'outstanding', 'utilities', 'admissions']).parse(req.params.name);
  const propertyId = req.query.propertyId && /^[a-f\d]{24}$/i.test(String(req.query.propertyId)) ? String(req.query.propertyId) : '';
  if (propertyId && req.user?.role !== 'SUPER_ADMIN' && !(req.user?.propertyIds ?? []).includes(propertyId)) return res.status(403).json({ error: 'You do not have access to this property.' });
  if (propertyId && !await (await import('../models/Property.js')).Property.exists({ _id: propertyId })) return res.status(404).json({ error: 'Property not found.' });
  const propertyRoomIds = propertyId ? await Room.distinct('_id', { propertyId }) : null;
  const propertyResidentIds = propertyRoomIds ? await RoomAllocation.distinct('residentId', { roomId: { $in: propertyRoomIds } }) : null;
  const accessResidents = await scopedResidentIds(req, propertyId || undefined);
  const accessRooms = await scopedRoomIds(req, propertyId || undefined);
  if (accessResidents.forbidden || accessRooms.forbidden) return res.status(403).json({ error: 'You do not have access to this property.' });
  const scopedResidentFilter = accessResidents.ids === null ? {} : { _id: { $in: accessResidents.ids } };
  const scopedPaymentFilter = accessResidents.ids === null ? {} : { residentId: { $in: accessResidents.ids } };
  const scopedChargeFilter = accessResidents.ids === null ? {} : { residentId: { $in: accessResidents.ids } };
  const from = req.query.from ? new Date(String(req.query.from)) : new Date('2000-01-01T00:00:00Z'); const to = req.query.to ? new Date(String(req.query.to)) : new Date('2100-01-01T00:00:00Z');
  let rows: Record<string, unknown>[];
  if (name === 'residents') {
    const [residents, properties, reportRooms] = await Promise.all([
      Resident.find({ ...scopedResidentFilter, status: 'ACTIVE', ...(propertyResidentIds ? { _id: { $in: propertyResidentIds } } : {}) }).sort({ fullName: 1 }).lean(),
      Property.find(propertyId ? { _id: propertyId } : req.user?.role === 'SUPER_ADMIN' ? {} : { _id: { $in: (req.user?.propertyIds ?? []).map((id) => new Types.ObjectId(id)) } }).sort({ name: 1 }).lean(),
      Room.find({ ...(accessRooms.ids === null ? {} : { _id: { $in: accessRooms.ids } }), ...(propertyId ? { propertyId } : {}) }).lean(),
    ]);
    const residentIds = residents.map((resident) => resident._id);
    const residentById = new Map(residents.map((resident) => [String(resident._id), resident]));
    const roomById = new Map(reportRooms.map((room) => [String(room._id), room]));
    const propertyById = new Map(properties.map((property) => [String(property._id), property]));
    const depositEntries = residentIds.length ? await DepositTransaction.find({ residentId: { $in: residentIds } }).select('residentId amountPaise kind').lean() : [];
    const depositBalanceByResident = new Map<string, number>();
    const residentIdsWithDepositLedger = new Set<string>();
    for (const entry of depositEntries) {
      const key = String(entry.residentId);
      residentIdsWithDepositLedger.add(key);
      const delta = entry.kind === 'RECEIVED' ? entry.amountPaise : ['REFUNDED', 'APPLIED'].includes(entry.kind) ? -entry.amountPaise : 0;
      depositBalanceByResident.set(key, (depositBalanceByResident.get(key) ?? 0) + delta);
    }
    for (const resident of residents) {
      const key = String(resident._id);
      if (!residentIdsWithDepositLedger.has(key)) depositBalanceByResident.set(key, resident.securityDepositPaise ?? 0);
    }
    const activeRooms = reportRooms.filter((room) => room.active && room.propertyId && propertyById.has(String(room.propertyId)));
    const activeAllocations = activeRooms.length ? await RoomAllocation.find({ active: true, roomId: { $in: activeRooms.map((room) => room._id) } }).lean() : [];
    const allocationByBed = new Map(activeAllocations.map((allocation) => [`${String(allocation.roomId)}:${allocation.bedId}`, allocation]));
    const currentlyAssigned = new Set(activeAllocations.map((allocation) => String(allocation.residentId)));
    const reportRows: Record<string, unknown>[] = [];
    const rowForResident = (resident: (typeof residents)[number], propertyName: string, roomNumber: string, bed: string) => ({
      propertyName, roomNumber, bed, name: resident.fullName, mobile: resident.mobile, status: resident.status,
      admissionDate: resident.admissionDate, rentRupees: (resident.rentSchedules.at(-1)?.monthlyRentPaise ?? 0) / 100,
      depositRupees: Math.max(0, depositBalanceByResident.get(String(resident._id)) ?? 0) / 100,
    });
    for (const property of properties) {
      const propertyIdString = String(property._id);
      const rooms = activeRooms.filter((room) => String(room.propertyId) === propertyIdString).sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true, sensitivity: 'base' }));
      for (const room of rooms) {
        const bedIds = room.beds.filter((bed) => bed.active !== false).map((bed) => bed.bedId);
        const slots = bedIds.length ? bedIds : Array.from({ length: room.capacity }, (_, index) => String(index + 1));
        for (const allocation of activeAllocations.filter((item) => String(item.roomId) === String(room._id))) if (!slots.includes(allocation.bedId)) slots.push(allocation.bedId);
        for (const bedId of slots.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))) {
          const allocation = allocationByBed.get(`${String(room._id)}:${bedId}`);
          const resident = allocation ? residentById.get(String(allocation.residentId)) : null;
          reportRows.push(resident
            ? rowForResident(resident, property.name, room.roomNumber, bedId)
            : { propertyName: property.name, roomNumber: room.roomNumber, bed: bedId, name: 'Empty bed', mobile: '', status: 'VACANT', admissionDate: '', rentRupees: 0, depositRupees: 0 });
        }
      }
    }
    // Keep checked-out and legacy records visible, while leaving their former bed marked unoccupied.
    for (const resident of residents) {
      if (currentlyAssigned.has(String(resident._id))) continue;
      const lastAllocation = [...resident.allocations].reverse().find((allocation) => allocation.roomId);
      const historicalRoom = lastAllocation?.roomId ? roomById.get(String(lastAllocation.roomId)) : undefined;
      const propertyName = historicalRoom?.propertyId ? propertyById.get(String(historicalRoom.propertyId))?.name ?? historicalRoom.propertyName : 'Unassigned property';
      reportRows.push(rowForResident(resident, propertyName || 'Unassigned property', lastAllocation?.roomNumber ?? historicalRoom?.roomNumber ?? '', '—'));
    }
    rows = reportRows.sort((a, b) => String(a.propertyName).localeCompare(String(b.propertyName), undefined, { numeric: true, sensitivity: 'base' }) || String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true, sensitivity: 'base' }) || String(a.bed).localeCompare(String(b.bed), undefined, { numeric: true, sensitivity: 'base' }) || String(a.name).localeCompare(String(b.name)));
  }
  else if (name === 'admissions') rows = (await Resident.find({ ...scopedResidentFilter, ...(propertyResidentIds ? { _id: { $in: propertyResidentIds } } : {}), admissionDate: { $gte: from, $lte: to } }).sort({ fullName: 1 }).lean()).map((r) => ({ residentId: r.residentId, name: r.fullName, mobile: r.mobile, status: r.status, admissionDate: r.admissionDate, room: r.allocations.find((a) => !a.endDate)?.roomNumber ?? '', rentRupees: (r.rentSchedules.at(-1)?.monthlyRentPaise ?? 0) / 100 }));
  else if (name === 'occupancy') rows = await Room.aggregate([{ $match: { active: true, ...(accessRooms.ids === null ? {} : { _id: { $in: accessRooms.ids } }), ...(propertyId ? { propertyId: new Types.ObjectId(propertyId) } : {}) } }, { $lookup: { from: 'roomallocations', let: { rid: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$roomId', '$$rid'] }, { $eq: ['$active', true] }] } } }], as: 'allocations' } }, { $project: { roomNumber: 1, roomType: 1, capacity: 1, occupied: { $size: '$allocations' }, available: { $subtract: ['$capacity', { $size: '$allocations' }] } } }]);
  else if (name === 'collections') rows = (await Payment.find({ paymentDate: { $gte: from, $lte: to }, reversedAt: null, ...scopedPaymentFilter, ...(propertyResidentIds ? { residentId: { $in: propertyResidentIds } } : {}) }).populate('residentId', 'residentId fullName').sort({ paymentDate: -1 }).lean()).map((p) => ({ date: p.paymentDate, resident: (p.residentId as unknown as { fullName: string }).fullName, method: p.method, amountRupees: p.amountPaise / 100, reference: p.reference }));
  else { const filter: Record<string, unknown> = { dueAt: { $gte: from, $lte: to }, ...scopedChargeFilter, ...(propertyResidentIds ? { residentId: { $in: propertyResidentIds } } : {}) }; if (name === 'overdue') { const overdue = rentChargeMongoFilter('OVERDUE') as { dueAt: unknown; $expr: unknown }; filter.kind = 'RENT'; filter.$and = [{ dueAt: overdue.dueAt }, { dueAt: { $gte: from, $lte: to } }, { $expr: overdue.$expr }]; delete filter.dueAt; } if (name === 'utilities') filter.kind = 'UTILITY'; if (name === 'rent') filter.kind = 'RENT'; if (name === 'outstanding') filter.$expr = { $lt: [{ $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }, '$amountPaise'] }; rows = (await Charge.find(filter).populate('residentId', 'residentId fullName').sort({ dueAt: 1 }).lean()).map((c) => { const resident = c.residentId as unknown as { fullName: string }; const rentLedger = c.kind === 'RENT' ? rentChargeLedger(c) : null; const ledger = rentLedger ?? chargeLedger(c); return { resident: resident.fullName, kind: c.kind, description: c.description, period: c.periodKey, servicePeriodStart: c.servicePeriodStart ?? null, servicePeriodEnd: c.servicePeriodEnd ?? null, dueAt: c.dueAt, amountRupees: c.amountPaise / 100, paidRupees: c.paidPaise / 100, externalPaidRupees: (c.externalPaidPaise ?? 0) / 100, outstandingRupees: ledger.balancePaise / 100, status: ledger.status, ...(rentLedger ? { rentStatus: rentLedger.rentStatus, daysPastDue: rentLedger.daysPastDue } : {}) }; }); }
  if (req.query.format === 'csv') {
    const columns = rows.length ? Object.keys(rows[0]!) : ['result']; const cell = (value: unknown) => { const text = String(value ?? ''); const safe = /^[\s]*[=+@]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; };
    res.type('text/csv'); res.setHeader('Content-Disposition', `attachment; filename="aashray-${name}.csv"`); return res.send([columns.map(cell).join(','), ...rows.map((row) => columns.map((key) => cell(row[key])).join(','))].join('\r\n'));
  }
  return res.json({ report: name, rows, from, to });
}));

export default router;
