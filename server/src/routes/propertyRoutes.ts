import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Room } from '../models/Room.js';
import { Property } from '../models/Property.js';
import { Resident } from '../models/Resident.js';
import { RoomAllocation } from '../models/RoomAllocation.js';
import { Charge } from '../models/Charge.js';
import { Payment } from '../models/Payment.js';
import { DepositTransaction } from '../models/DepositTransaction.js';
import { ResidentMigration } from '../models/ResidentMigration.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { residentIsInScope, scopedResidentIds, scopedRoomIds } from '../middleware/propertyAccess.js';
import { inTransaction } from '../services/transactions.js';
import { billingDayForDate, billingStartDateForPeriod, chargeStatus, dueDateForPeriod, paiseFromRupees, periodKeyFor } from '../services/billingRules.js';
import { admitResident } from '../services/admissionService.js';
import { chargeLedger, residentFinancialSummary, rentChargeLedger } from '../services/financialCalculations.js';
import { migrationOpeningPosition } from '../services/migrationAccounting.js';
import { rentChargeMongoFilter, summarizeRentCharges } from '../services/rentStatus.js';

const router = Router();
router.use(requireAuth);
const date = z.coerce.date();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const roomInput = z.object({ propertyId: objectId.optional(), roomNumber: z.string().trim().min(1).max(40), roomType: z.enum(['AC', 'NON_AC']), capacity: z.number().int().min(1).max(30), bedIds: z.array(z.string().trim().min(1).max(20)).optional(), notes: z.string().max(1000).default('') });
const residentInput = z.object({ fullName: z.string().trim().min(2).max(140), mobile: z.string().trim().min(8).max(24), email: z.string().trim().email().max(254).or(z.literal('')).default(''), governmentId: z.string().max(80).default(''), emergencyContact: z.string().max(120).default(''), admissionDate: date, billingStartDate: date, roomId: objectId, bedId: z.string().trim().min(1).max(20), monthlyRent: z.number().positive().max(10000000), dueDay: z.number().int().min(1).max(31), securityDeposit: z.number().min(0).max(10000000).default(0), depositPaid: z.number().min(0).max(10000000).default(0), depositMethod: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'OTHER']).default('CASH'), notes: z.string().max(3000).default(''), idempotencyKey: z.string().uuid() }).superRefine((value, ctx) => { if (value.depositPaid > value.securityDeposit) ctx.addIssue({ code: 'custom', path: ['depositPaid'], message: 'Deposit received cannot exceed the agreed security deposit.' }); });

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) { const char = text[i]!; if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { row.push(cell); cell = ''; } else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = ''; } else cell += char; }
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row); return rows;
}
const importHeaders = ['fullName','mobile','email','emergencyContact','governmentId','admissionDate','billingStartDate','roomNumber','bedId','monthlyRent','dueDay','securityDeposit','depositPaid','depositMethod','notes'];
async function validateResidentCsv(csv: string, allowedPropertyIds: string[] | null = null) {
  const matrix = parseCsv(csv); const headers = matrix.shift()?.map((header) => header.trim());
  if (!headers || importHeaders.some((header) => !headers.includes(header))) throw Object.assign(new Error(`CSV must include these columns: ${importHeaders.join(', ')}`), { status: 422 });
  const hash = createHash('sha256').update(csv).digest('hex'); const valid: { row: number; data: z.infer<typeof residentInput> }[] = []; const errors: { row: number; message: string }[] = [];
  for (const [index, cells] of matrix.entries()) {
    const record = Object.fromEntries(headers.map((header, position) => [header, cells[position]?.trim() ?? '']));
    const room = await Room.findOne({ roomNumber: record.roomNumber, active: true, ...(allowedPropertyIds === null ? {} : { propertyId: { $in: allowedPropertyIds } }) }).select('_id');
    const candidate = { ...record, roomId: room ? String(room._id) : '', monthlyRent: Number(record.monthlyRent), dueDay: Number(record.dueDay), securityDeposit: Number(record.securityDeposit || 0), depositPaid: Number(record.depositPaid || 0), depositMethod: record.depositMethod || 'CASH', idempotencyKey: `${hash.slice(0, 8)}-${String(index + 1).padStart(4, '0')}-4000-8000-${hash.slice(8, 20)}` };
    const parsed = residentInput.safeParse(candidate);
    if (!room) errors.push({ row: index + 2, message: `Room ${record.roomNumber || '(empty)'} was not found or is inactive.` });
    else if (!parsed.success) errors.push({ row: index + 2, message: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') });
    else valid.push({ row: index + 2, data: parsed.data });
  }
  return { hash, valid, errors };
}

router.get('/rooms', requirePermission('rooms:read'), async (req, res) => {
  const filter: Record<string, unknown> = {};
  const requestedPropertyId = req.query.propertyId && objectId.safeParse(req.query.propertyId).success ? String(req.query.propertyId) : undefined;
  if (requestedPropertyId) filter.propertyId = requestedPropertyId;
  const roomScope = await scopedRoomIds(req, requestedPropertyId);
  if (roomScope.forbidden) return res.status(403).json({ error: 'You do not have access to this property.' });
  if (roomScope.ids !== null) filter._id = { $in: roomScope.ids };
  if (req.query.active === 'true') filter.active = true;
  if (req.query.active === 'false') filter.active = false;
  if (req.query.search) filter.roomNumber = { $regex: String(req.query.search).slice(0, 50), $options: 'i' };
  if (req.query.roomType === 'AC' || req.query.roomType === 'NON_AC') filter.roomType = req.query.roomType;
  const rooms = await Room.find(filter).sort({ roomNumber: 1 }).lean();
  const allocations = await RoomAllocation.aggregate([{ $match: { active: true } }, { $group: { _id: '$roomId', occupied: { $sum: 1 }, beds: { $push: '$bedId' } } }]);
  const occ = new Map(allocations.map((a) => [String(a._id), a]));
  return res.json({ rooms: rooms.map((room) => { const o = occ.get(String(room._id)); return { ...room, occupied: o?.occupied ?? 0, available: Math.max(0, room.capacity - (o?.occupied ?? 0)), occupiedBeds: o?.beds ?? [] }; }) });
});

router.post('/rooms', requirePermission('rooms:write'), async (req, res) => {
  const data = roomInput.parse(req.body);
  const property = data.propertyId ? await Property.findOne({ _id: data.propertyId, active: true }) : null;
  if (!property) return res.status(422).json({ error: 'Choose an active property before creating a room.' });
  if (req.user?.role !== 'SUPER_ADMIN' && !(req.user?.propertyIds ?? []).includes(String(property._id))) return res.status(403).json({ error: 'You do not have access to this property.' });
  const beds = data.bedIds?.length ? data.bedIds : Array.from({ length: data.capacity }, (_, i) => String(i + 1));
  if (beds.length !== data.capacity || new Set(beds).size !== beds.length) return res.status(422).json({ error: 'Provide one unique bed identifier for each bed in the room capacity.' });
  let room;
  try { room = await Room.create({ ...data, propertyId: property._id, propertyName: property.name, beds: beds.map((bedId) => ({ bedId, active: true })) }); }
  catch (error) { if ((error as { code?: number }).code === 11000) return res.status(409).json({ error: 'That room number already exists in this property.' }); throw error; }
  return res.status(201).json({ room });
});

router.put('/rooms/:id', requirePermission('rooms:write'), async (req, res) => {
  const data = roomInput.parse(req.body);
  const room = await Room.findById(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  if (req.user?.role !== 'SUPER_ADMIN' && !(req.user?.propertyIds ?? []).includes(String(room.propertyId))) return res.status(403).json({ error: 'You do not have access to this property.' });
  const property = data.propertyId ? await Property.findOne({ _id: data.propertyId, active: true }) : null;
  if (!property) return res.status(422).json({ error: 'Choose an active property for this room.' });
  if (req.user?.role !== 'SUPER_ADMIN' && !(req.user?.propertyIds ?? []).includes(String(property._id))) return res.status(403).json({ error: 'You do not have access to this property.' });
  const active = await RoomAllocation.countDocuments({ roomId: room._id, active: true });
  if (active && String(room.propertyId ?? '') !== String(property._id)) return res.status(409).json({ error: 'Move current residents before changing a room\'s property.' });
  if (data.capacity < active) return res.status(409).json({ error: 'Capacity cannot be lower than the number of current occupants.' });
  const beds = data.bedIds?.length ? data.bedIds : room.beds.slice(0, data.capacity).map((b) => b.bedId).concat(Array.from({ length: Math.max(0, data.capacity - room.beds.length) }, (_, i) => String(room.beds.length + i + 1)));
  if (beds.length !== data.capacity || new Set(beds).size !== beds.length) return res.status(422).json({ error: 'Provide one unique bed identifier for each bed in the room capacity.' });
  const occupied = await RoomAllocation.distinct('bedId', { roomId: room._id, active: true });
  if (occupied.some((bedId) => !beds.includes(bedId))) return res.status(409).json({ error: 'Move occupants before removing their bed identifiers.' });
  room.set({ ...data, propertyId: property._id, propertyName: property.name, beds: beds.map((bedId) => ({ bedId, active: true })) });
  try { await room.save(); } catch (error) { if ((error as { code?: number }).code === 11000) return res.status(409).json({ error: 'That room number already exists in this property.' }); throw error; }
  return res.json({ room });
});

router.patch('/rooms/:id/deactivate', requirePermission('rooms:write'), async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  if (req.user?.role !== 'SUPER_ADMIN' && !(req.user?.propertyIds ?? []).includes(String(room.propertyId))) return res.status(403).json({ error: 'You do not have access to this property.' });
  if (await RoomAllocation.exists({ roomId: room._id, active: true })) return res.status(409).json({ error: 'Move residents before deactivating an occupied room.' });
  room.active = false; await room.save(); return res.json({ room });
});

router.get('/residents', requirePermission('residents:read'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const filter: Record<string, unknown> = {};
  if (['ACTIVE', 'NOTICE', 'INACTIVE'].includes(String(req.query.status))) filter.status = req.query.status;
  if (req.query.search) { const term = String(req.query.search).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = [{ fullName: { $regex: term, $options: 'i' } }, { mobile: { $regex: term, $options: 'i' } }, { residentId: { $regex: term, $options: 'i' } }]; }
  if (req.query.propertyId && objectId.safeParse(req.query.propertyId).success) {
    const propertyRooms = await Room.distinct('_id', { propertyId: req.query.propertyId });
    const matching = await RoomAllocation.distinct('residentId', { active: true, roomId: { $in: propertyRooms } });
    filter._id = { $in: matching };
  }
  if (req.query.roomId && objectId.safeParse(req.query.roomId).success) {
    const matching = await RoomAllocation.distinct('residentId', { active: true, roomId: req.query.roomId }); filter._id = { $in: matching };
  } else if (req.query.roomType === 'AC' || req.query.roomType === 'NON_AC') {
    const roomIds = await Room.distinct('_id', { roomType: req.query.roomType }); const matching = await RoomAllocation.distinct('residentId', { active: true, roomId: { $in: roomIds } }); filter._id = { $in: matching };
  }
  if (req.query.outstanding === 'true' || req.query.outstanding === 'false') {
    const aggregates = await Charge.aggregate([{ $group: { _id: '$residentId', balance: { $sum: { $max: [0, { $subtract: ['$amountPaise', { $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }] }] } } } }, { $match: { balance: { $gt: 0 } } }]);
    const outstandingIds = aggregates.map((x) => x._id); if (req.query.outstanding === 'false') { const hasBalance = new Set(outstandingIds.map((id) => String(id))); const all = await Resident.distinct('_id', filter); filter._id = { $in: all.filter((id) => !hasBalance.has(String(id))) }; } else { const existingIds = (filter._id as { $in?: unknown[] } | undefined)?.$in; const existingSet = existingIds ? new Set(existingIds.map(String)) : null; filter._id = { $in: outstandingIds.filter((id) => !existingSet || existingSet.has(String(id))) }; }
  }
  const rentPaymentStatus = String(req.query.rentStatus ?? req.query.rentPaymentStatus ?? '');
  const rentStatus = rentPaymentStatus === 'PAID' ? 'CLEARED' : rentPaymentStatus;
  const requestedPeriod = String(req.query.rentPeriod ?? periodKeyFor(new Date()));
  const rentPeriod = requestedPeriod === 'all' || /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedPeriod) ? requestedPeriod : periodKeyFor(new Date());
  if (['CLEARED', 'OVERDUE', 'DUE_GRACE', 'UPCOMING', 'NO_BILL'].includes(rentStatus)) {
    const rentFilter: Record<string, unknown> = { kind: 'RENT', ...(rentPeriod === 'all' ? {} : { periodKey: rentPeriod }) };
    if (rentStatus === 'NO_BILL') {
      const billedIds = new Set((await Charge.distinct('residentId', { kind: 'RENT', ...(rentPeriod === 'all' ? {} : { periodKey: rentPeriod }) })).map(String));
      const candidates = await Resident.distinct('_id', filter);
      filter._id = { $in: candidates.filter((residentId) => !billedIds.has(String(residentId))) };
    }
    const matchingIds = rentStatus === 'NO_BILL' ? [] : await Charge.distinct('residentId', { ...rentFilter, ...rentChargeMongoFilter(rentStatus as 'CLEARED' | 'OVERDUE' | 'DUE_GRACE' | 'UPCOMING') });
    const existingIds = (filter._id as { $in?: unknown[] } | undefined)?.$in;
    const existingSet = existingIds ? new Set(existingIds.map(String)) : null;
    if (rentStatus !== 'NO_BILL') filter._id = { $in: matchingIds.filter((id) => !existingSet || existingSet.has(String(id))) };
  }
  const residentScope = await scopedResidentIds(req, req.query.propertyId && objectId.safeParse(req.query.propertyId).success ? String(req.query.propertyId) : undefined);
  if (residentScope.forbidden) return res.status(403).json({ error: 'You do not have access to this property.' });
  if (residentScope.ids !== null) {
    const currentIds = (filter._id as { $in?: unknown[] } | undefined)?.$in;
    const allowedIds = new Set(residentScope.ids.map(String));
    filter._id = { $in: currentIds ? currentIds.filter((id) => allowedIds.has(String(id))) : residentScope.ids };
  }
  const sortKey = String(req.query.sort ?? 'createdAt'); const sortField = ({ name: 'fullName', admissionDate: 'admissionDate', residentId: 'residentId', createdAt: 'createdAt' } as Record<string, string>)[sortKey] ?? 'createdAt'; const direction = req.query.direction === 'asc' ? 1 : -1;
  const [residents, total] = await Promise.all([Resident.find(filter).sort({ [sortField]: direction }).skip((page - 1) * limit).limit(limit).lean(), Resident.countDocuments(filter)]);
  const ids = residents.map((r) => r._id);
  const [allocations, charges, periodCharges] = await Promise.all([RoomAllocation.find({ residentId: { $in: ids }, active: true }).populate({ path: 'roomId', select: 'roomNumber roomType propertyId propertyName' }).lean(), Charge.aggregate([{ $match: { residentId: { $in: ids } } }, { $group: { _id: '$residentId', outstandingPaise: { $sum: { $max: [0, { $subtract: ['$amountPaise', { $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }] }] } } } }]), Charge.find({ residentId: { $in: ids }, kind: 'RENT', ...(rentPeriod === 'all' ? {} : { periodKey: rentPeriod }) }).sort({ dueAt: 1 }).lean()]);
  const allocMap = new Map(allocations.map((a) => [String(a.residentId), a])); const balanceMap = new Map(charges.map((c) => [String(c._id), c.outstandingPaise]));
  const periodChargeMap = new Map<string, typeof periodCharges>();
  for (const charge of periodCharges) { const key = String(charge.residentId); periodChargeMap.set(key, [...(periodChargeMap.get(key) ?? []), charge]); }
  const now = new Date();
  return res.json({ residents: residents.map((r) => {
    const residentCharges = periodChargeMap.get(String(r._id)) ?? [];
    return { ...r, currentAllocation: allocMap.get(String(r._id)) ?? null, outstandingPaise: balanceMap.get(String(r._id)) ?? 0, currentRentPaise: [...r.rentSchedules].sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0]?.monthlyRentPaise ?? 0, rentSummary: summarizeRentCharges(residentCharges, now), rentPeriod };
  }), page, limit, total, pages: Math.ceil(total / limit) });
});

router.get('/imports/residents/template', requirePermission('residents:read'), (_req, res) => {
  res.type('text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="aashray-resident-import-template.csv"');
  return res.send(`${importHeaders.join(',')}\r\nExample Resident,+919876543210,,,,2026-10-01,2026-10-01,101,1,8500,5,10000,0,CASH,`);
});
router.post('/imports/residents/preview', requirePermission('residents:write'), async (req, res) => {
  const { csv } = z.object({ csv: z.string().min(1).max(1_500_000) }).parse(req.body); const result = await validateResidentCsv(csv, req.user?.role === 'SUPER_ADMIN' ? null : req.user?.propertyIds ?? []);
  return res.json({ previewId: result.hash, rows: result.valid.map(({ row, data }) => ({ row, fullName: data.fullName, mobile: data.mobile, roomId: data.roomId, bedId: data.bedId, monthlyRent: data.monthlyRent, billingStartDate: data.billingStartDate })), errors: result.errors, validCount: result.valid.length, errorCount: result.errors.length });
});
router.post('/imports/residents/commit', requirePermission('residents:write'), async (req, res) => {
  const { csv, previewId } = z.object({ csv: z.string().min(1).max(1_500_000), previewId: z.string().length(64) }).parse(req.body); const result = await validateResidentCsv(csv, req.user?.role === 'SUPER_ADMIN' ? null : req.user?.propertyIds ?? []);
  if (result.hash !== previewId) return res.status(409).json({ error: 'The selected CSV changed after preview. Preview it again before importing.' });
  let inserted = 0; let skipped = 0; const failures = [...result.errors];
  for (const row of result.valid) {
    try { const created = await admitResident(row.data, req.user!.id); if (created.duplicate) skipped++; else inserted++; }
    catch (error) { failures.push({ row: row.row, message: (error as Error).message }); }
  }
  return res.json({ inserted, skipped, failed: failures.length, errors: failures });
});

router.post('/residents', requirePermission('residents:write'), async (req, res) => {
  const data = residentInput.parse(req.body);
  const targetRoom = await Room.findById(data.roomId).select('propertyId').lean();
  if (!targetRoom) return res.status(422).json({ error: 'Choose an active room and bed.' });
  if (req.user?.role !== 'SUPER_ADMIN' && !(req.user?.propertyIds ?? []).includes(String(targetRoom.propertyId ?? ''))) return res.status(403).json({ error: 'You do not have access to this property.' });
  try {
    const result = await admitResident(data, req.user!.id);
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return res.status(409).json({ error: 'That resident ID, bed, or initial billing period already exists. Refresh and try again.' });
    }
    throw error;
  }
});

router.get('/residents/:id', requirePermission('residents:read'), async (req, res) => {
  const resident = await Resident.findById(req.params.id).lean();
  if (!resident) return res.status(404).json({ error: 'Resident not found.' });
  if (!await residentIsInScope(req, String(resident._id))) return res.status(403).json({ error: 'You do not have access to this resident’s property.' });
  const [allocations, charges, payments, deposits, messages, audit, migration] = await Promise.all([
    RoomAllocation.find({ residentId: resident._id }).populate('roomId', 'roomNumber roomType').sort({ startDate: -1 }).lean(),
    Charge.find({ residentId: resident._id }).sort({ dueAt: -1 }).lean(),
    Payment.find({ residentId: resident._id }).sort({ paymentDate: -1 }).lean(),
    DepositTransaction.find({ residentId: resident._id }).sort({ createdAt: -1 }).lean(),
    (await import('../models/MessageLog.js')).MessageLog.find({ residentId: resident._id }).sort({ createdAt: -1 }).limit(50).lean(),
    AuditEvent.find({ entityType: 'Resident', entityId: String(resident._id) }).sort({ createdAt: -1 }).limit(100).lean(),
    ResidentMigration.findOne({ residentId: resident._id }).lean(),
  ]);
  const ledger = charges.map((c) => ({ ...c, ...(c.kind === 'RENT' ? rentChargeLedger(c) : chargeLedger(c)) }));
  const summary = residentFinancialSummary(charges);
  const currentRentSummary = summarizeRentCharges(charges.filter((charge) => charge.kind === 'RENT' && charge.periodKey === periodKeyFor(new Date())));
  return res.json({ resident, migration, allocations, charges: ledger, payments: payments.map((payment) => ({ ...payment, allocatedPaise: payment.reversedAt ? 0 : payment.allocations.reduce((sum, allocation) => sum + allocation.amountPaise, 0), unallocatedPaise: payment.reversedAt ? 0 : payment.amountPaise - payment.allocations.reduce((sum, allocation) => sum + allocation.amountPaise, 0) })), deposits, messages, audit, outstandingPaise: summary.outstandingPaise, overduePaise: summary.overdueRentPaise, rentOutstandingPaise: summary.rentOutstandingPaise, openingBalanceOutstandingPaise: summary.openingBalanceOutstandingPaise, rentSummary: currentRentSummary, pendingUtilityPaise: summary.pendingUtilityPaise, depositBalancePaise: deposits.reduce((sum, deposit) => sum + (deposit.kind === 'RECEIVED' ? deposit.amountPaise : deposit.kind === 'REFUNDED' ? -deposit.amountPaise : 0), 0) });
});

const migrationFields = z.object({ goLiveDate: date, monthlyRent: z.number().positive().max(10000000), dueDay: z.number().int().min(1).max(31), openingArrears: z.number().min(0).max(10000000).default(0), prepaidRent: z.number().min(0).max(10000000).default(0), currentPeriodSettled: z.number().min(0).max(10000000).default(0), securityDepositHeld: z.number().min(0).max(10000000).default(0), source: z.string().trim().min(2).max(160), description: z.string().trim().min(5).max(500), depositMethod: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'OTHER']).default('CASH') });
const validateMigrationAmounts = (value: z.infer<typeof migrationFields>, ctx: z.RefinementCtx) => { if (value.currentPeriodSettled > value.monthlyRent) ctx.addIssue({ code: 'custom', path: ['currentPeriodSettled'], message: 'The current period settlement cannot exceed one month of rent; enter any extra prepaid amount separately.' }); };
const migrationInput = migrationFields.superRefine(validateMigrationAmounts);

router.post('/residents/:id/migration-preview', requirePermission('billing:write'), async (req, res) => {
  const data = migrationInput.parse(req.body); const resident = await Resident.findById(req.params.id).lean();
  if (!resident) return res.status(404).json({ error: 'Resident not found.' });
  if (!await residentIsInScope(req, String(resident._id))) return res.status(403).json({ error: 'You do not have access to this resident’s property.' });
  const goLiveDate = data.goLiveDate; const periodKey = periodKeyFor(goLiveDate); const rentPaise = paiseFromRupees(data.monthlyRent, true);
  const existingMigration = await ResidentMigration.findOne({ residentId: resident._id }).lean();
  const [existingCharge, existingDepositTransactions, currentCharges] = await Promise.all([
    Charge.findOne({ residentId: resident._id, kind: 'RENT', periodKey }).lean(),
    DepositTransaction.find({ residentId: resident._id }).lean(),
    Charge.find({ residentId: resident._id }).sort({ dueAt: -1 }).limit(20).lean(),
  ]);
  const depositLedgerPaise = existingDepositTransactions.reduce((sum, item) => sum + (item.kind === 'RECEIVED' ? item.amountPaise : item.kind === 'REFUNDED' ? -item.amountPaise : 0), 0);
  const openingPosition = migrationOpeningPosition(paiseFromRupees(data.openingArrears, true), paiseFromRupees(data.prepaidRent, true));
  return res.json({ preview: { resident: { id: String(resident._id), residentId: resident.residentId, fullName: resident.fullName, admissionDate: resident.admissionDate, billingStartDate: resident.billingStartDate }, goLiveDate, periodKey, monthlyRentPaise: rentPaise, dueDay: billingDayForDate(resident.admissionDate), ...openingPosition, currentPeriodSettledPaise: paiseFromRupees(data.currentPeriodSettled, true), securityDepositHeldPaise: paiseFromRupees(data.securityDepositHeld, true), projectedOpeningNetPaise: openingPosition.openingBalancePaise, existingMigration: Boolean(existingMigration), existingPeriodCharge: existingCharge ? { id: String(existingCharge._id), amountPaise: existingCharge.amountPaise, paidPaise: existingCharge.paidPaise, kind: existingCharge.kind } : null, depositLedgerPaise, depositMatches: !existingDepositTransactions.length || depositLedgerPaise === paiseFromRupees(data.securityDepositHeld, true), depositWillBeRecorded: !existingDepositTransactions.length && paiseFromRupees(data.securityDepositHeld, true) > 0, recentCharges: currentCharges.map((charge) => ({ id: String(charge._id), kind: charge.kind, periodKey: charge.periodKey, amountPaise: charge.amountPaise, paidPaise: charge.paidPaise, description: charge.description })) } });
});

router.post('/residents/:id/migration', requirePermission('billing:write'), async (req, res) => {
  const data = migrationFields.extend({ confirmed: z.literal(true) }).superRefine(validateMigrationAmounts).parse(req.body);
  const resident = await Resident.findById(req.params.id); if (!resident) return res.status(404).json({ error: 'Resident not found.' });
  if (!await residentIsInScope(req, String(resident._id))) return res.status(403).json({ error: 'You do not have access to this resident’s property.' });
  const goLiveDate = data.goLiveDate; const periodKey = periodKeyFor(goLiveDate); const rentPaise = paiseFromRupees(data.monthlyRent, true);
  const arrearsPaise = paiseFromRupees(data.openingArrears, true); const prepaidPaise = paiseFromRupees(data.prepaidRent, true); const currentSettledPaise = paiseFromRupees(data.currentPeriodSettled, true); const depositHeldPaise = paiseFromRupees(data.securityDepositHeld, true);
  const openingPosition = migrationOpeningPosition(arrearsPaise, prepaidPaise);
  const depositEntries = await DepositTransaction.find({ residentId: resident._id }).lean();
  const depositBalance = depositEntries.reduce((sum, item) => sum + (item.kind === 'RECEIVED' ? item.amountPaise : item.kind === 'REFUNDED' ? -item.amountPaise : 0), 0);
  if (depositBalance !== depositHeldPaise && depositEntries.length) return res.status(409).json({ error: 'The verified held deposit differs from the existing deposit ledger. Reconcile the deposit ledger before migration.' });
  try {
    await inTransaction(async (session) => {
      if (await ResidentMigration.exists({ residentId: resident._id }).session(session)) throw Object.assign(new Error('This resident has already been migrated.'), { status: 409 });
      const existingCharge = await Charge.findOne({ residentId: resident._id, kind: 'RENT', periodKey }).session(session);
      if (existingCharge && currentSettledPaise > 0) {
        const unverifiedBalance = existingCharge.amountPaise - existingCharge.paidPaise - (existingCharge.externalPaidPaise ?? 0);
        if (currentSettledPaise > unverifiedBalance) throw Object.assign(new Error('The verified outside settlement exceeds the remaining current-period charge balance.'), { status: 409 });
        existingCharge.externalPaidPaise = (existingCharge.externalPaidPaise ?? 0) + currentSettledPaise;
        existingCharge.status = chargeStatus(existingCharge.amountPaise, existingCharge.paidPaise + existingCharge.externalPaidPaise, existingCharge.dueAt);
        existingCharge.audit.push({ at: new Date(), by: new Types.ObjectId(req.user!.id), action: 'EXTERNAL_SETTLEMENT_RECORDED', reason: `${data.source}: ${data.description}`, beforePaise: unverifiedBalance, afterPaise: unverifiedBalance - currentSettledPaise });
        await existingCharge.save({ session });
        await AuditEvent.create([{ actorId: req.user!.id, action: 'EXTERNAL_RENT_SETTLEMENT_RECORDED', entityType: 'Charge', entityId: String(existingCharge._id), reason: data.description, details: { source: data.source, periodKey, amountPaise: currentSettledPaise } }], { session });
      }
      const prepaidAppliedToArrearsPaise = openingPosition.prepaidAppliedToArrearsPaise;
      const dueDay = billingDayForDate(resident.admissionDate);
      const billingStartDate = billingStartDateForPeriod(periodKey, dueDay);
      const migration = (await ResidentMigration.create([{ residentId: resident._id, goLiveDate, periodKey, monthlyRentPaise: rentPaise, dueDay, openingArrearsPaise: arrearsPaise, prepaidRentPaise: prepaidPaise, currentPeriodSettledPaise: currentSettledPaise, creditRemainingPaise: openingPosition.creditRemainingPaise, securityDepositHeldPaise: depositHeldPaise, source: data.source, description: data.description, createdBy: req.user!.id }], { session }))[0]!;
      resident.billingStartDate = billingStartDate;
      resident.securityDepositPaise = depositHeldPaise;
      resident.rentSchedules.push({ version: (resident.rentSchedules.at(-1)?.version ?? 0) + 1, monthlyRentPaise: rentPaise, dueDay, effectiveFrom: billingStartDate, changedBy: new Types.ObjectId(req.user!.id), reason: `Migration at ${periodKey}` });
      await resident.save({ session });
      if (arrearsPaise > 0) {
        const [charge] = await Charge.create([{ residentId: resident._id, kind: 'OPENING_BALANCE', periodKey: `OPENING-${periodKey}`, description: `Opening rent arrears as of ${goLiveDate.toISOString().slice(0, 10)}: ${data.description}`, amountPaise: arrearsPaise, paidPaise: 0, externalPaidPaise: prepaidAppliedToArrearsPaise, status: chargeStatus(arrearsPaise, prepaidAppliedToArrearsPaise, goLiveDate), issuedAt: new Date(), dueAt: goLiveDate, idempotencyKey: `opening:${resident._id}`, createdBy: req.user!.id, audit: [{ at: new Date(), by: req.user!.id, action: 'OPENING_BALANCE_POSTED', reason: `${data.source}: ${data.description}`, afterPaise: arrearsPaise }, ...(prepaidAppliedToArrearsPaise ? [{ at: new Date(), by: req.user!.id, action: 'PREPAID_CREDIT_APPLIED', reason: `Applied verified prepaid rent from ${data.source}`, beforePaise: arrearsPaise, afterPaise: arrearsPaise - prepaidAppliedToArrearsPaise }] : [])] }], { session });
        await AuditEvent.create([{ actorId: req.user!.id, action: 'OPENING_BALANCE_POSTED', entityType: 'Charge', entityId: String(charge!._id), reason: data.description, details: { migrationId: String(migration._id), source: data.source, effectiveDate: goLiveDate, amountPaise: arrearsPaise, prepaidAppliedToArrearsPaise } }], { session });
      }
      if (!depositEntries.length && depositHeldPaise > 0) await DepositTransaction.create([{ residentId: resident._id, amountPaise: depositHeldPaise, kind: 'RECEIVED', paymentMethod: data.depositMethod, reference: `MIGRATION-${periodKey}`, reason: `Verified deposit held at migration cutoff: ${data.description}`, createdBy: req.user!.id, idempotencyKey: `deposit:${resident._id}:migration` }], { session });
      await AuditEvent.create([{ actorId: req.user!.id, action: 'RESIDENT_MIGRATED', entityType: 'Resident', entityId: String(resident._id), reason: data.description, details: { migrationId: String(migration._id), admissionDatePreserved: resident.admissionDate, billingStartDate: goLiveDate, periodKey, source: data.source, openingArrearsPaise: arrearsPaise, prepaidPaise, currentSettledPaise, depositHeldPaise } }], { session });
    });
  } catch (error) { if ((error as { code?: number }).code === 11000) return res.status(409).json({ error: 'A migration or opening balance already exists for this resident.' }); throw error; }
  return res.status(201).json({ migrated: true, periodKey, admissionDatePreserved: resident.admissionDate, openingArrearsPaise: arrearsPaise, prepaidRentPaise: prepaidPaise, currentPeriodSettledPaise: currentSettledPaise, securityDepositHeldPaise: depositHeldPaise });
});

router.put('/residents/:id', requirePermission('residents:write'), async (req, res) => {
  const data = z.object({ fullName: z.string().trim().min(2).max(140), mobile: z.string().trim().min(8).max(24), email: z.string().email().or(z.literal('')).default(''), emergencyContact: z.string().max(120).default(''), governmentId: z.string().max(80).default(''), notes: z.string().max(3000).default(''), monthlyRent: z.number().positive().max(10000000), dueDay: z.number().int().min(1).max(31), effectiveFrom: date, roomId: objectId, bedId: z.string().min(1).max(20) }).parse(req.body);
  const now = new Date(); const nextPeriodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  if (data.effectiveFrom < nextPeriodStart || data.effectiveFrom.getUTCDate() !== 1) return res.status(422).json({ error: 'Rent schedule changes must start on the first day of a future billing period. Previously issued charges are never rewritten.' });
  const [resident, targetRoom] = await Promise.all([Resident.findById(req.params.id), Room.findOne({ _id: req.body.roomId, active: true })]);
  if (!resident) return res.status(404).json({ error: 'Resident not found.' });
  if (!await residentIsInScope(req, String(resident._id))) return res.status(403).json({ error: 'You do not have access to this resident’s property.' });
  if (!targetRoom || !targetRoom.beds.some((b) => b.bedId === data.bedId && b.active)) return res.status(422).json({ error: 'Select an active room and bed.' });
  if (req.user?.role !== 'SUPER_ADMIN' && !(req.user?.propertyIds ?? []).includes(String(targetRoom.propertyId ?? ''))) return res.status(403).json({ error: 'You do not have access to the destination property.' });
  const rentPaise = paiseFromRupees(data.monthlyRent); const dueDay = billingDayForDate(resident.admissionDate); const changedRent = resident.rentSchedules.at(-1)?.monthlyRentPaise !== rentPaise || resident.rentSchedules.at(-1)?.dueDay !== dueDay;
  const current = await RoomAllocation.findOne({ residentId: resident._id, active: true });
  const changedRoom = !current || String(current.roomId) !== String(targetRoom._id) || current.bedId !== data.bedId;
  try {
    await inTransaction(async (session) => {
      if (changedRoom) {
        const previous = await RoomAllocation.findOne({ residentId: resident._id, active: true }).session(session);
        if (previous) { previous.active = false; previous.endDate = data.effectiveFrom; await previous.save({ session }); }
        await RoomAllocation.create([{ residentId: resident._id, roomId: targetRoom._id, bedId: data.bedId, startDate: data.effectiveFrom, changedBy: req.user!.id, reason: 'Resident room transfer' }], { session });
        resident.allocations.push({ roomId: targetRoom._id, roomNumber: targetRoom.roomNumber, bedId: data.bedId, startDate: data.effectiveFrom, changedBy: new Types.ObjectId(req.user!.id), reason: 'Resident room transfer' });
      }
      if (changedRent) resident.rentSchedules.push({ version: (resident.rentSchedules.at(-1)?.version ?? 0) + 1, monthlyRentPaise: rentPaise, dueDay, effectiveFrom: data.effectiveFrom, changedBy: new Types.ObjectId(req.user!.id), reason: 'Schedule edited by operator' });
      resident.set({ fullName: data.fullName, mobile: data.mobile, email: data.email.toLowerCase(), emergencyContact: data.emergencyContact, governmentId: data.governmentId, notes: data.notes });
      await resident.save({ session });
      await AuditEvent.create([{ actorId: req.user!.id, action: changedRoom ? 'ROOM_TRANSFER' : changedRent ? 'RENT_SCHEDULE_CHANGED' : 'RESIDENT_UPDATED', entityType: 'Resident', entityId: String(resident._id), reason: changedRent ? 'Schedule updated; historical charges remain unchanged.' : '', details: { changedRent, changedRoom, effectiveFrom: data.effectiveFrom } }], { session });
    });
  } catch (error) { if ((error as { code?: number }).code === 11000) return res.status(409).json({ error: 'That bed is already occupied.' }); throw error; }
  return res.json({ resident });
});

router.patch('/residents/:id/status', requirePermission('residents:write'), async (req, res) => {
  const data = z.object({ status: z.enum(['ACTIVE', 'NOTICE', 'INACTIVE']), noticeStartDate: date.optional(), expectedDepartureDate: date.optional(), effectiveEndDate: date.optional(), reason: z.string().max(500).default('') }).parse(req.body);
  const resident = await Resident.findById(req.params.id); if (!resident) return res.status(404).json({ error: 'Resident not found.' });
  if (!await residentIsInScope(req, String(resident._id))) return res.status(403).json({ error: 'You do not have access to this resident’s property.' });
  if (data.status === 'ACTIVE' && resident.status === 'INACTIVE') return res.status(409).json({ error: 'A checked-out resident needs a new room allocation before reactivation.' });
  await inTransaction(async (session) => {
    resident.status = data.status;
    if (data.status === 'ACTIVE') { resident.noticeStartDate = null; resident.expectedDepartureDate = null; }
    if (data.status === 'NOTICE') { resident.noticeStartDate = data.noticeStartDate ?? new Date(); resident.expectedDepartureDate = data.expectedDepartureDate ?? null; }
    if (data.status === 'INACTIVE') {
      resident.effectiveEndDate = data.effectiveEndDate ?? new Date();
      const allocation = await RoomAllocation.findOne({ residentId: resident._id, active: true }).session(session);
      if (allocation) { allocation.active = false; allocation.endDate = resident.effectiveEndDate; await allocation.save({ session }); }
      const currentRecord = resident.allocations.find((a) => !a.endDate);
      if (currentRecord) currentRecord.endDate = resident.effectiveEndDate;
    }
    await resident.save({ session });
    await AuditEvent.create([{ actorId: req.user!.id, action: 'RESIDENT_STATUS_CHANGED', entityType: 'Resident', entityId: String(resident._id), reason: data.reason, details: { status: data.status } }], { session });
  });
  return res.json({ resident });
});

router.get('/residents/:id/preview-rent', requirePermission('residents:read'), async (req, res) => {
  const data = z.object({ billingStartDate: date, dueDay: z.coerce.number().int().min(1).max(31), monthlyRent: z.coerce.number().positive() }).parse(req.query);
  const resident = await Resident.findById(req.params.id).select('admissionDate').lean();
  if (!resident) return res.status(404).json({ error: 'Resident not found.' });
  if (!await residentIsInScope(req, String(req.params.id))) return res.status(403).json({ error: 'You do not have access to this resident’s property.' });
  const periodKey = periodKeyFor(data.billingStartDate);
  return res.json({ policy: 'FULL_MONTH', periodKey, amountPaise: paiseFromRupees(data.monthlyRent), dueAt: dueDateForPeriod(periodKey, billingDayForDate(resident.admissionDate)) });
});

export default router;
