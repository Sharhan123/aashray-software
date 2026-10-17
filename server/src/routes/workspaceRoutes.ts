import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import argon2 from 'argon2';
import { User, STAFF_PERMISSIONS, type Permission } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Room } from '../models/Room.js';
import { RoomAllocation } from '../models/RoomAllocation.js';
import { Resident } from '../models/Resident.js';
import { Charge } from '../models/Charge.js';
import { Payment } from '../models/Payment.js';
import { ResidentMigration } from '../models/ResidentMigration.js';
import { MessageLog } from '../models/MessageLog.js';
import { AppSettings } from '../models/AppSettings.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { chargeBalance, chargeLedger } from '../services/financialCalculations.js';
import { periodKeyFor } from '../services/billingRules.js';

const router = Router(); router.use(requireAuth);
const safeUser = (user: { id?: string; name: string; email: string; role: string; active: boolean; permissions: string[]; lastLoginAt?: Date | null; createdAt?: Date }) => ({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, permissions: user.permissions, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt });

router.get('/dashboard', requirePermission('dashboard:read'), async (_req, res) => {
  const now = new Date(); const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [activeResidents, totalBeds, occupiedBeds, rentBilled, rentCollected, externalRentCollected, balances, overdueBalances, utilityPending, upcomingDues, recentPayments, recentAdmissions] = await Promise.all([
    Resident.countDocuments({ status: 'ACTIVE' }), Room.aggregate([{ $match: { active: true } }, { $group: { _id: null, total: { $sum: '$capacity' } } }]), RoomAllocation.countDocuments({ active: true }),
    Charge.aggregate([{ $match: { kind: 'RENT', dueAt: { $gte: monthStart, $lt: monthEnd } } }, { $group: { _id: null, total: { $sum: '$amountPaise' } } }]),
    Payment.aggregate([{ $match: { paymentDate: { $gte: monthStart, $lt: monthEnd }, reversedAt: null } }, { $unwind: '$allocations' }, { $lookup: { from: 'charges', localField: 'allocations.chargeId', foreignField: '_id', as: 'charge' } }, { $unwind: '$charge' }, { $match: { 'charge.kind': { $in: ['RENT', 'OPENING_BALANCE'] } } }, { $group: { _id: null, total: { $sum: '$allocations.amountPaise' } } }]),
    ResidentMigration.aggregate([{ $match: { periodKey: periodKeyFor(now) } }, { $group: { _id: null, total: { $sum: '$currentPeriodSettledPaise' } } }]),
    Charge.aggregate([{ $group: { _id: '$kind', amount: { $sum: { $max: [0, { $subtract: ['$amountPaise', { $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }] }] } } } }]),
    Charge.aggregate([{ $match: { kind: { $in: ['RENT', 'OPENING_BALANCE'] }, dueAt: { $lt: now }, $expr: { $lt: [{ $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }, '$amountPaise'] } } }, { $group: { _id: null, total: { $sum: { $max: [0, { $subtract: ['$amountPaise', { $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }] }] } } } }]),
    Charge.aggregate([{ $match: { kind: 'UTILITY', $expr: { $lt: [{ $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }, '$amountPaise'] } } }, { $group: { _id: null, total: { $sum: { $max: [0, { $subtract: ['$amountPaise', { $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }] }] } } } }]),
    Charge.find({ dueAt: { $gte: now }, $expr: { $lt: [{ $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }, '$amountPaise'] } }).populate('residentId', 'residentId fullName').sort({ dueAt: 1 }).limit(8).lean(),
    Payment.find({ reversedAt: null }).populate('residentId', 'residentId fullName').sort({ paymentDate: -1 }).limit(8).lean(), Resident.find().sort({ admissionDate: -1 }).limit(8).select('residentId fullName admissionDate').lean(),
  ]);
  const rent = balances.filter((x) => x._id === 'RENT' || x._id === 'OPENING_BALANCE').reduce((sum, charge) => sum + charge.amount, 0);
  return res.json({ period: { start: monthStart, end: monthEnd }, metrics: { activeResidents, totalBeds: totalBeds[0]?.total ?? 0, occupiedBeds, availableBeds: Math.max(0, (totalBeds[0]?.total ?? 0) - occupiedBeds), rentBilledPaise: rentBilled[0]?.total ?? 0, rentCollectedPaise: (rentCollected[0]?.total ?? 0) + (externalRentCollected[0]?.total ?? 0), outstandingRentPaise: rent, overdueRentPaise: overdueBalances[0]?.total ?? 0, pendingUtilityPaise: utilityPending[0]?.total ?? 0 }, upcomingDues, recentPayments, recentAdmissions });
});

router.get('/staff', requirePermission('staff:read'), async (_req, res) => {
  const staff = await User.find({ role: 'STAFF' }).sort({ createdAt: -1 }).lean(); return res.json({ staff: staff.map((u) => safeUser({ ...u, id: String(u._id) })) });
});
router.post('/staff', requirePermission('staff:write'), requireRole('SUPER_ADMIN'), async (req, res) => {
  const data = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254), password: z.string().min(14).max(200), permissions: z.array(z.enum(STAFF_PERMISSIONS)).default([]) }).parse(req.body);
  const staff = await User.create({ ...data, email: data.email.toLowerCase(), role: 'STAFF', active: true, permissions: data.permissions, passwordHash: await argon2.hash(data.password, { type: argon2.argon2id }) });
  await AuditEvent.create({ actorId: req.user!.id, action: 'STAFF_CREATED', entityType: 'User', entityId: String(staff._id), details: { permissions: staff.permissions } });
  return res.status(201).json({ staff: safeUser({ ...staff.toObject(), id: String(staff._id) }) });
});
router.patch('/staff/:id', requirePermission('staff:write'), requireRole('SUPER_ADMIN'), async (req, res) => {
  const data = z.object({ active: z.boolean().optional(), permissions: z.array(z.enum(STAFF_PERMISSIONS)).optional() }).refine((d) => d.active !== undefined || d.permissions !== undefined).parse(req.body);
  const staff = await User.findOne({ _id: req.params.id, role: 'STAFF' }); if (!staff) return res.status(404).json({ error: 'Staff account not found.' });
  if (data.active !== undefined) staff.active = data.active; if (data.permissions) staff.permissions = data.permissions as Permission[]; await staff.save();
  if (!staff.active) await Session.deleteMany({ userId: staff._id });
  await AuditEvent.create({ actorId: req.user!.id, action: 'STAFF_UPDATED', entityType: 'User', entityId: String(staff._id), details: { active: staff.active, permissions: staff.permissions } });
  return res.json({ staff: safeUser({ ...staff.toObject(), id: String(staff._id) }) });
});
router.post('/staff/:id/reset-password', requirePermission('staff:write'), requireRole('SUPER_ADMIN'), async (req, res) => {
  const { password } = z.object({ password: z.string().min(14).max(200) }).parse(req.body);
  const staff = await User.findOne({ _id: req.params.id, role: 'STAFF' }).select('+passwordHash'); if (!staff) return res.status(404).json({ error: 'Staff account not found.' });
  staff.passwordHash = await argon2.hash(password, { type: argon2.argon2id }); await staff.save(); await Session.deleteMany({ userId: staff._id });
  await AuditEvent.create({ actorId: req.user!.id, action: 'STAFF_PASSWORD_RESET', entityType: 'User', entityId: String(staff._id) }); return res.status(204).end();
});

router.get('/settings', requirePermission('settings:read'), async (_req, res) => {
  const settings = await AppSettings.findOneAndUpdate({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
  return res.json({ settings: { ...settings, whatsappConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && settings.whatsappPhoneNumberId), whatsappAccessToken: undefined } });
});
router.put('/settings', requirePermission('settings:write'), requireRole('SUPER_ADMIN'), async (req, res) => {
  const data = z.object({ businessName: z.string().trim().min(2).max(160), contactPhone: z.string().max(30), contactEmail: z.string().email().or(z.literal('')), timezone: z.literal('Asia/Kolkata'), reminderOffsets: z.array(z.number().int().min(-30).max(30)).max(10), paymentMethods: z.array(z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'OTHER'])).min(1), utilityTypes: z.array(z.string().trim().min(2).max(60)).max(20), whatsappPhoneNumberId: z.string().max(100), whatsappBusinessAccountId: z.string().max(100), whatsappAutoRemindersEnabled: z.boolean() }).parse(req.body);
  if (data.whatsappAutoRemindersEnabled) return res.status(422).json({ error: 'Automated WhatsApp delivery stays disabled until an audited template, recipient consent, webhook, and delivery workflow are configured.' });
  const settings = await AppSettings.findOneAndUpdate({ key: 'main' }, { $set: { ...data, whatsappEnabled: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && data.whatsappPhoneNumberId) } }, { new: true, upsert: true, runValidators: true }).lean();
  await AuditEvent.create({ actorId: req.user!.id, action: 'SETTINGS_UPDATED', entityType: 'AppSettings', entityId: 'main' });
  return res.json({ settings: { ...settings, whatsappConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && settings.whatsappPhoneNumberId), whatsappAccessToken: undefined } });
});

router.post('/messages/prepare', requirePermission('messages:send'), async (req, res) => {
  const data = z.object({ residentId: z.string().regex(/^[a-f\d]{24}$/i), propertyId: z.string().regex(/^[a-f\d]{24}$/i).optional(), messageType: z.enum(['RENT_REMINDER', 'OVERDUE', 'UTILITY', 'CUSTOM']), customMessage: z.string().max(4000).default('') }).parse(req.body);
  const resident = await Resident.findById(data.residentId).lean(); if (!resident) return res.status(404).json({ error: 'Resident not found.' });
  let propertyName = 'Aashray Hospitality';
  if (data.propertyId) {
    const property = await (await import('../models/Property.js')).Property.findOne({ _id: data.propertyId, active: true }).lean();
    const roomIds = await Room.distinct('_id', { propertyId: data.propertyId });
    if (!property || !await RoomAllocation.exists({ residentId: resident._id, roomId: { $in: roomIds }, active: true })) return res.status(422).json({ error: 'Choose a resident currently assigned to this property.' });
    propertyName = property.name;
  }
  let message = data.customMessage.trim();
  if (data.messageType !== 'CUSTOM') {
    const charges = await Charge.find({ residentId: resident._id, ...(data.messageType === 'UTILITY' ? { kind: 'UTILITY' } : { kind: { $in: ['RENT', 'OPENING_BALANCE'] } }), $expr: { $gt: ['$amountPaise', { $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }] } }).sort({ dueAt: 1 }).lean();
    if (!charges.length) return res.status(422).json({ error: 'There are no unpaid charges of this type to remind this resident about.' });
    const balance = charges.reduce((sum, c) => sum + chargeBalance(c), 0);
    const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(balance / 100);
    const due = charges[0]?.dueAt ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(charges[0].dueAt) : 'your upcoming due date';
    const period = [...new Set(charges.map((charge) => charge.periodKey))].join(', ');
    message = data.messageType === 'OVERDUE' ? `Hello ${resident.fullName}, ${propertyName} records show an outstanding balance of ${amount}${period ? ` for ${period}` : ''}. Please contact us to arrange payment. Thank you.` : data.messageType === 'UTILITY' ? `Hello ${resident.fullName}, your pending utility balance at ${propertyName} is ${amount}${period ? ` for ${period}` : ''}, due ${due}. Please contact us if you have any questions.` : `Hello ${resident.fullName}, this is a friendly rent reminder from ${propertyName}. Your pending balance is ${amount}${period ? ` for ${period}` : ''}, due ${due}. Thank you.`;
  }
  if (!message) return res.status(422).json({ error: 'Enter a message to prepare.' });
  const log = await MessageLog.create({ residentId: resident._id, authorId: req.user!.id, recipient: resident.mobile, messageType: data.messageType, message, deliveryMechanism: 'WHATSAPP_CLICK_TO_CHAT', status: 'PREPARED' });
  const digits = resident.mobile.replace(/\D/g, '').replace(/^0+/, ''); const phone = digits.length === 10 ? `91${digits}` : digits;
  return res.status(201).json({ message: log, whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` });
});
router.post('/messages/:id/opened', requirePermission('messages:send'), async (req, res) => {
  const message = await MessageLog.findByIdAndUpdate(req.params.id, { $set: { status: 'OPENED_MANUALLY', openedAt: new Date() } }, { new: true });
  if (!message) return res.status(404).json({ error: 'Message record not found.' }); return res.json({ message });
});
router.get('/messages', requirePermission('messages:read'), async (req, res) => {
  const filter: Record<string, unknown> = {};
  if (req.query.propertyId && /^[a-f\d]{24}$/i.test(String(req.query.propertyId))) { const roomIds = await Room.distinct('_id', { propertyId: req.query.propertyId }); const residentIds = await RoomAllocation.distinct('residentId', { roomId: { $in: roomIds } }); filter.residentId = { $in: residentIds }; }
  const messages = await MessageLog.find(filter).populate('residentId', 'residentId fullName').populate('authorId', 'name').sort({ createdAt: -1 }).limit(200).lean(); return res.json({ messages });
});

router.get('/reports/:name', requirePermission('reports:read'), async (req, res) => {
  const name = z.enum(['residents', 'occupancy', 'rent', 'overdue', 'collections', 'outstanding', 'utilities', 'admissions']).parse(req.params.name);
  const propertyId = req.query.propertyId && /^[a-f\d]{24}$/i.test(String(req.query.propertyId)) ? String(req.query.propertyId) : '';
  if (propertyId && !await (await import('../models/Property.js')).Property.exists({ _id: propertyId })) return res.status(404).json({ error: 'Property not found.' });
  const propertyRoomIds = propertyId ? await Room.distinct('_id', { propertyId }) : null;
  const propertyResidentIds = propertyRoomIds ? await RoomAllocation.distinct('residentId', { roomId: { $in: propertyRoomIds } }) : null;
  const from = req.query.from ? new Date(String(req.query.from)) : new Date('2000-01-01T00:00:00Z'); const to = req.query.to ? new Date(String(req.query.to)) : new Date('2100-01-01T00:00:00Z');
  let rows: Record<string, unknown>[];
  if (name === 'residents' || name === 'admissions') rows = (await Resident.find({ ...(name === 'admissions' ? { admissionDate: { $gte: from, $lte: to } } : {}), ...(propertyResidentIds ? { _id: { $in: propertyResidentIds } } : {}) }).sort({ fullName: 1 }).lean()).map((r) => ({ residentId: r.residentId, name: r.fullName, mobile: r.mobile, status: r.status, admissionDate: r.admissionDate, room: r.allocations.find((a) => !a.endDate)?.roomNumber ?? '', rentRupees: (r.rentSchedules.at(-1)?.monthlyRentPaise ?? 0) / 100 }));
  else if (name === 'occupancy') rows = await Room.aggregate([{ $match: { active: true, ...(propertyId ? { propertyId: new Types.ObjectId(propertyId) } : {}) } }, { $lookup: { from: 'roomallocations', let: { rid: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$roomId', '$$rid'] }, { $eq: ['$active', true] }] } } }], as: 'allocations' } }, { $project: { roomNumber: 1, roomType: 1, capacity: 1, occupied: { $size: '$allocations' }, available: { $subtract: ['$capacity', { $size: '$allocations' }] } } }]);
  else if (name === 'collections') rows = (await Payment.find({ paymentDate: { $gte: from, $lte: to }, reversedAt: null, ...(propertyResidentIds ? { residentId: { $in: propertyResidentIds } } : {}) }).populate('residentId', 'residentId fullName').sort({ paymentDate: -1 }).lean()).map((p) => ({ date: p.paymentDate, resident: (p.residentId as unknown as { fullName: string }).fullName, method: p.method, amountRupees: p.amountPaise / 100, reference: p.reference }));
  else { const filter: Record<string, unknown> = { dueAt: { $gte: from, $lte: to }, ...(propertyResidentIds ? { residentId: { $in: propertyResidentIds } } : {}) }; if (name === 'overdue') { filter.dueAt = { $lt: new Date() }; filter.kind = { $in: ['RENT', 'OPENING_BALANCE'] }; } if (name === 'utilities') filter.kind = 'UTILITY'; if (name === 'rent') filter.kind = 'RENT'; if (name === 'outstanding') filter.$expr = { $lt: [{ $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }, '$amountPaise'] }; rows = (await Charge.find(filter).populate('residentId', 'residentId fullName').sort({ dueAt: 1 }).lean()).map((c) => { const resident = c.residentId as unknown as { fullName: string }; const ledger = chargeLedger(c); return { resident: resident.fullName, kind: c.kind, description: c.description, period: c.periodKey, dueAt: c.dueAt, amountRupees: c.amountPaise / 100, paidRupees: c.paidPaise / 100, externalPaidRupees: (c.externalPaidPaise ?? 0) / 100, outstandingRupees: ledger.balancePaise / 100, status: ledger.status }; }); }
  if (req.query.format === 'csv') {
    const columns = rows.length ? Object.keys(rows[0]!) : ['result']; const cell = (value: unknown) => { const text = String(value ?? ''); const safe = /^[\s]*[=+@]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; };
    res.type('text/csv'); res.setHeader('Content-Disposition', `attachment; filename="aashray-${name}.csv"`); return res.send([columns.map(cell).join(','), ...rows.map((row) => columns.map((key) => cell(row[key])).join(','))].join('\r\n'));
  }
  return res.json({ report: name, rows, from, to });
});

export default router;
