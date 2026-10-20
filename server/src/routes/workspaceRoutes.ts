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
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { chargeBalance, chargeLedger, rentChargeLedger } from '../services/financialCalculations.js';
import { periodKeyFor } from '../services/billingRules.js';
import { businessMonthRange, rentChargeMongoFilter, summarizeRentCharges } from '../services/rentStatus.js';
import { residentIsInScope, scopedResidentIds, scopedRoomIds } from '../middleware/propertyAccess.js';

const router = Router(); router.use(requireAuth);
const defaultRentReminderTemplate = 'Hello {residentName}, there is a rent due of {amount} from Aashray Paying Guest for {month}. Please pay it within 5 days of the due date ({dueDate}). Thank you.';
const safeUser = (user: { id?: string; name: string; email: string; role: string; active: boolean; permissions: string[]; propertyIds?: unknown[]; lastLoginAt?: Date | null; createdAt?: Date }) => ({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, permissions: user.permissions, propertyIds: (user.propertyIds ?? []).map(String), lastLoginAt: user.lastLoginAt, createdAt: user.createdAt });

router.get('/dashboard', requirePermission('dashboard:read'), asyncHandler(async (req, res) => {
  const now = new Date(); const { start: monthStart, end: monthEnd } = businessMonthRange(now); const currentPeriod = periodKeyFor(now);
  const residentScope = await scopedResidentIds(req); const roomScope = await scopedRoomIds(req);
  const residentFilter = residentScope.ids === null ? {} : { _id: { $in: residentScope.ids } };
  const chargeResidentFilter = residentScope.ids === null ? {} : { residentId: { $in: residentScope.ids } };
  const paymentResidentFilter = residentScope.ids === null ? {} : { residentId: { $in: residentScope.ids } };
  const roomMatch = roomScope.ids === null ? {} : { _id: { $in: roomScope.ids } };
  const rentBalanceExpr = { $max: [0, { $subtract: ['$amountPaise', { $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }] }] };
  const rentOverdueFilter = { kind: 'RENT', ...rentChargeMongoFilter('OVERDUE', now) };
  const [activeResidents, totalBeds, occupiedBeds, rentBilled, rentCollected, externalRentCollected, balances, rentOutstanding, openingOutstanding, overdueBalances, overdueResidentIds, utilityPending, securityDepositsHeld, upcomingDues, recentPayments, recentAdmissions] = await Promise.all([
    Resident.countDocuments({ ...residentFilter, status: 'ACTIVE' }), Room.aggregate([{ $match: { active: true, ...roomMatch } }, { $group: { _id: null, total: { $sum: '$capacity' } } }]), RoomAllocation.countDocuments({ active: true, ...(roomScope.ids === null ? {} : { roomId: { $in: roomScope.ids } }) }),
    Charge.aggregate([{ $match: { kind: 'RENT', periodKey: currentPeriod, ...chargeResidentFilter } }, { $group: { _id: null, total: { $sum: '$amountPaise' } } }]),
    Payment.aggregate([{ $match: { paymentDate: { $gte: monthStart, $lt: monthEnd }, reversedAt: null, ...paymentResidentFilter } }, { $unwind: '$allocations' }, { $lookup: { from: 'charges', localField: 'allocations.chargeId', foreignField: '_id', as: 'charge' } }, { $unwind: '$charge' }, { $match: { 'charge.kind': 'RENT' } }, { $group: { _id: null, total: { $sum: '$allocations.amountPaise' } } }]),
    ResidentMigration.aggregate([{ $match: { periodKey: periodKeyFor(now), ...chargeResidentFilter } }, { $group: { _id: null, total: { $sum: '$currentPeriodSettledPaise' } } }]),
    Charge.aggregate([{ $match: chargeResidentFilter }, { $group: { _id: '$kind', amount: { $sum: rentBalanceExpr } } }]),
    Charge.aggregate([{ $match: { kind: 'RENT', ...chargeResidentFilter, $expr: { $gt: [rentBalanceExpr, 0] } } }, { $group: { _id: null, total: { $sum: rentBalanceExpr } } }]),
    Charge.aggregate([{ $match: { kind: 'OPENING_BALANCE', ...chargeResidentFilter, $expr: { $gt: [rentBalanceExpr, 0] } } }, { $group: { _id: null, total: { $sum: rentBalanceExpr } } }]),
    Charge.aggregate([{ $match: { ...rentOverdueFilter, ...chargeResidentFilter } }, { $group: { _id: null, total: { $sum: rentBalanceExpr } } }]),
    Charge.distinct('residentId', { ...rentOverdueFilter, ...chargeResidentFilter }),
    Charge.aggregate([{ $match: { kind: 'UTILITY', ...chargeResidentFilter, $expr: { $lt: [{ $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }, '$amountPaise'] } } }, { $group: { _id: null, total: { $sum: { $max: [0, { $subtract: ['$amountPaise', { $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }] }] } } } }]),
    DepositTransaction.aggregate([
      { $match: chargeResidentFilter },
      { $group: { _id: '$residentId', balancePaise: { $sum: { $switch: { branches: [{ case: { $eq: ['$kind', 'RECEIVED'] }, then: '$amountPaise' }, { case: { $in: ['$kind', ['REFUNDED', 'APPLIED']] }, then: { $multiply: ['$amountPaise', -1] } }], default: 0 } } } } },
      { $group: { _id: null, total: { $sum: { $max: [0, '$balancePaise'] } } } },
    ]),
    Charge.find({ kind: 'RENT', ...rentChargeMongoFilter('UPCOMING', now), periodKey: currentPeriod, ...chargeResidentFilter }).populate('residentId', 'residentId fullName').sort({ dueAt: 1 }).limit(8).lean(),
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
  const overdueResidents = await Resident.find({ _id: { $in: overdueResidentIds }, status: { $in: ['ACTIVE', 'NOTICE'] } }).select('_id residentId fullName').limit(8).lean();
  const overdueChargeRows = overdueResidents.length ? await Charge.find({ residentId: { $in: overdueResidents.map((resident) => resident._id) }, ...rentOverdueFilter }).sort({ dueAt: 1 }).lean() : [];
  const allocations = await RoomAllocation.find({ residentId: { $in: overdueResidents.map((resident) => resident._id) }, active: true }).populate('roomId', 'roomNumber propertyName').lean();
  const allocationByResident = new Map(allocations.map((allocation) => [String(allocation.residentId), allocation]));
  const overdueFollowUps = overdueResidents.map((resident) => {
    const residentCharges = overdueChargeRows.filter((charge) => String(charge.residentId) === String(resident._id));
    const rentSummary = summarizeRentCharges(residentCharges, now);
    const allocation = allocationByResident.get(String(resident._id));
    const room = allocation?.roomId as unknown as { roomNumber?: string; propertyName?: string } | null;
    return { residentId: String(resident._id), residentCode: resident.residentId, fullName: resident.fullName, outstandingRentPaise: rentSummary.balancePaise, dueAt: rentSummary.dueAt, daysPastDue: rentSummary.daysPastDue, roomNumber: room?.roomNumber ?? '', bedId: allocation?.bedId ?? '', propertyName: room?.propertyName ?? '' };
  });
  return res.json({ period: { start: monthStart, end: monthEnd, periodKey: currentPeriod }, metrics: { activeResidents, totalBeds: totalBeds[0]?.total ?? 0, occupiedBeds, availableBeds: Math.max(0, (totalBeds[0]?.total ?? 0) - occupiedBeds), genderBreakdown, rentBilledPaise: rentBilled[0]?.total ?? 0, rentCollectedPaise: (rentCollected[0]?.total ?? 0) + (externalRentCollected[0]?.total ?? 0), outstandingRentPaise: legacyRent, totalOutstandingRentPaise: rentOutstanding[0]?.total ?? 0, openingBalanceOutstandingPaise: openingOutstanding[0]?.total ?? 0, overdueRentPaise: overdueBalances[0]?.total ?? 0, overdueRentResidentCount: overdueResidentIds.length, pendingUtilityPaise: utilityPending[0]?.total ?? 0, securityDepositsHeldPaise: securityDepositsHeld[0]?.total ?? 0 }, overdueFollowUps, upcomingDues, recentPayments, recentAdmissions });
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
    const due = charges[0]?.dueAt ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(charges[0].dueAt) : 'your upcoming due date';
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
      const template = settings?.rentReminderTemplate?.trim() || defaultRentReminderTemplate;
      const values: Record<string, string> = { residentName: resident.fullName, amount, month: period || 'the current billing period', dueDate: due, property: propertyName };
      message = template.replace(/\{(residentName|amount|month|dueDate|property)\}/g, (_token, key: string) => values[key] ?? '');
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
  if (name === 'residents' || name === 'admissions') rows = (await Resident.find({ ...scopedResidentFilter, ...(propertyResidentIds ? { _id: { $in: propertyResidentIds } } : {}), ...(name === 'admissions' ? { admissionDate: { $gte: from, $lte: to } } : {}) }).sort({ fullName: 1 }).lean()).map((r) => ({ residentId: r.residentId, name: r.fullName, mobile: r.mobile, status: r.status, admissionDate: r.admissionDate, room: r.allocations.find((a) => !a.endDate)?.roomNumber ?? '', rentRupees: (r.rentSchedules.at(-1)?.monthlyRentPaise ?? 0) / 100 }));
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
