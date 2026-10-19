import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Charge, type ChargeDocument } from '../models/Charge.js';
import { Payment } from '../models/Payment.js';
import { Resident } from '../models/Resident.js';
import { Room } from '../models/Room.js';
import { RoomAllocation } from '../models/RoomAllocation.js';
import { Property } from '../models/Property.js';
import { DepositTransaction } from '../models/DepositTransaction.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { inTransaction } from '../services/transactions.js';
import { chargeStatus, paiseFromRupees } from '../services/billingRules.js';
import { validatePaymentAllocations } from '../services/paymentRules.js';
import { chargeLedger, rentChargeLedger } from '../services/financialCalculations.js';
import { rentChargeMongoFilter } from '../services/rentStatus.js';
import { previewMonthlyBilling, generateMonthlyBilling } from '../services/billingService.js';
import { residentIsInScope, scopedResidentIds } from '../middleware/propertyAccess.js';
import { resolveUtilityPeriod, utilityPeriodDescription, utilityPeriodMonthKeys, utilityPeriodSchema } from '../services/utilityPeriod.js';

const router = Router(); router.use(requireAuth);
const id = z.string().regex(/^[a-f\d]{24}$/i); const day = z.coerce.date();
function rangeDate(value: unknown, upperBoundary = false) {
  const text = String(value); const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (upperBoundary && match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 18, 29, 59, 999));
  return new Date(text);
}

router.get('/charges', requirePermission('billing:read'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const filter: Record<string, unknown> = {};
  if (req.query.residentId && id.safeParse(req.query.residentId).success) filter.residentId = req.query.residentId;
  const requestedPropertyId = req.query.propertyId && id.safeParse(req.query.propertyId).success ? String(req.query.propertyId) : undefined;
  const scope = await scopedResidentIds(req, requestedPropertyId);
  if (scope.forbidden) return res.status(403).json({ error: 'You do not have access to this property.' });
  if (scope.ids !== null) { const current = filter.residentId; filter.residentId = { $in: current ? scope.ids.filter((residentId) => String(residentId) === String(current)) : scope.ids }; }
  if (req.query.kind === 'RENT' || req.query.kind === 'UTILITY' || req.query.kind === 'OPENING_BALANCE') filter.kind = req.query.kind;
  if (req.query.period) {
    const period = String(req.query.period).slice(0, 7);
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      const [year, month] = period.split('-').map(Number);
      const rangeStart = new Date(Date.UTC(year!, month! - 1, 1)); const rangeEnd = new Date(Date.UTC(year!, month!, 0, 23, 59, 59, 999));
      const conditions = Array.isArray(filter.$and) ? filter.$and as Record<string, unknown>[] : [];
      filter.$and = [...conditions, { $or: [
        { periodKey: { $in: [period, `OPENING-${period}`] } },
        { servicePeriodStart: { $lte: rangeEnd }, servicePeriodEnd: { $gte: rangeStart } },
      ] }];
    }
  }
  const now = new Date();
  if (req.query.rentStatus && ['CLEARED', 'OVERDUE', 'DUE_GRACE', 'UPCOMING'].includes(String(req.query.rentStatus))) {
    filter.kind = 'RENT'; Object.assign(filter, rentChargeMongoFilter(String(req.query.rentStatus) as 'CLEARED' | 'OVERDUE' | 'DUE_GRACE' | 'UPCOMING', now));
  } else if (req.query.status === 'OVERDUE') filter.$or = [
    { kind: 'RENT', ...rentChargeMongoFilter('OVERDUE', now) },
    { kind: { $ne: 'RENT' }, dueAt: { $lt: now }, $expr: { $lt: [{ $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }, '$amountPaise'] } },
  ];
  else if (req.query.status === 'PENDING') filter.$expr = { $and: [{ $gte: ['$dueAt', now] }, { $eq: [{ $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }, 0] }] };
  else if (req.query.status === 'PARTIAL') filter.$expr = { $and: [{ $gte: ['$dueAt', now] }, { $gt: [{ $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }, 0] }, { $lt: [{ $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }, '$amountPaise'] }] };
  else if (req.query.status === 'PAID') filter.$expr = { $gte: [{ $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }, '$amountPaise'] };
  if (req.query.from || req.query.to) filter.dueAt = { ...(req.query.from ? { $gte: rangeDate(req.query.from) } : {}), ...(req.query.to ? { $lte: rangeDate(req.query.to, true) } : {}) };
  if (req.query.format === 'csv') {
    const rows = await Charge.find(filter).populate('residentId', 'residentId fullName').sort({ dueAt: -1 }).limit(10000).lean();
    const columns = ['residentId', 'resident', 'kind', 'description', 'periodKey', 'servicePeriodStart', 'servicePeriodEnd', 'dueAt', 'amountPaise', 'paidPaise', 'externalPaidPaise', 'balancePaise', 'status'];
    const escape = (value: unknown) => `"${String(value ?? '').replace(/[=+@]/g, (ch, index) => index === 0 ? `'${ch}` : ch).replaceAll('"', '""')}"`;
    const csv = [columns.map(escape).join(','), ...rows.map((charge) => { const resident = charge.residentId as unknown as { residentId?: string; fullName?: string } | null; const ledger = charge.kind === 'RENT' ? rentChargeLedger(charge) : chargeLedger(charge); const record: Record<string, unknown> = { residentId: resident?.residentId, resident: resident?.fullName, kind: charge.kind, description: charge.description, periodKey: charge.periodKey, servicePeriodStart: charge.servicePeriodStart?.toISOString(), servicePeriodEnd: charge.servicePeriodEnd?.toISOString(), dueAt: charge.dueAt.toISOString(), amountPaise: charge.amountPaise, paidPaise: charge.paidPaise, externalPaidPaise: charge.externalPaidPaise ?? 0, balancePaise: ledger.balancePaise, status: ledger.status }; return columns.map((column) => escape(record[column])).join(','); })].join('\r\n');
    res.type('text/csv'); res.setHeader('Content-Disposition', 'attachment; filename="aashray-charges.csv"'); return res.send(csv);
  }
  const [charges, total] = await Promise.all([Charge.find(filter).populate('residentId', 'residentId fullName mobile').sort({ dueAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Charge.countDocuments(filter)]);
  const paymentRows = charges.length ? await Payment.find({ 'allocations.chargeId': { $in: charges.map((charge) => charge._id) } }).select('_id amountPaise paymentDate method reference reversedAt allocations').sort({ paymentDate: -1 }).lean() : [];
  const paymentsByCharge = new Map<string, Record<string, unknown>[]>();
  for (const payment of paymentRows) {
    const totalAllocated = payment.allocations.reduce((sum, allocation) => sum + allocation.amountPaise, 0);
    for (const allocation of payment.allocations) {
      const key = String(allocation.chargeId); const entries = paymentsByCharge.get(key) ?? [];
      entries.push({ paymentId: String(payment._id), paymentDate: payment.paymentDate, method: payment.method, amountPaise: payment.amountPaise, allocatedPaise: allocation.amountPaise, reference: payment.reference, allocationStatus: payment.reversedAt ? 'REVERSED' : totalAllocated < payment.amountPaise ? 'PARTIALLY_ALLOCATED' : 'ALLOCATED' });
      paymentsByCharge.set(key, entries);
    }
  }
  return res.json({ charges: charges.map((c) => ({ ...c, ...(c.kind === 'RENT' ? rentChargeLedger(c) : chargeLedger(c)), paymentHistory: paymentsByCharge.get(String(c._id)) ?? [] })), page, limit, total, pages: Math.ceil(total / limit) });
});

router.post('/utilities', requirePermission('utilities:write'), async (req, res) => {
  const data = z.object({ residentId: id, propertyId: id.optional(), utilityType: z.string().trim().min(2).max(60), amount: z.number().positive().max(10000000), issuedAt: day, dueAt: day, notes: z.string().max(1000).default(''), idempotencyKey: z.string().uuid() }).and(utilityPeriodSchema).parse(req.body);
  const servicePeriod = resolveUtilityPeriod(data);
  if (!await Resident.exists({ _id: data.residentId })) return res.status(404).json({ error: 'Resident not found.' });
  if (!await residentIsInScope(req, data.residentId)) return res.status(403).json({ error: 'You do not have access to this resident’s property.' });
  if (data.propertyId && req.user?.role !== 'SUPER_ADMIN' && !(req.user?.propertyIds ?? []).includes(data.propertyId)) return res.status(403).json({ error: 'You do not have access to this property.' });
  if (data.propertyId) { const property = await Property.findOne({ _id: data.propertyId, active: true }); const roomIds = await Room.distinct('_id', { propertyId: data.propertyId }); if (!property || !await RoomAllocation.exists({ residentId: data.residentId, roomId: { $in: roomIds }, active: true })) return res.status(422).json({ error: 'Choose a resident currently assigned to this property.' }); }
  const utilityIdempotencyKey = `utility:${data.idempotencyKey}`;
  const duplicateRequest = await Charge.findOne({ idempotencyKey: utilityIdempotencyKey });
  if (duplicateRequest) return res.json({ charge: duplicateRequest, duplicate: true });
  const duplicateUtilityFilter: Record<string, unknown> = { residentId: data.residentId, kind: 'UTILITY', utilityType: data.utilityType, $or: [
    { servicePeriodStart: { $lte: servicePeriod.servicePeriodEnd }, servicePeriodEnd: { $gte: servicePeriod.servicePeriodStart } },
    { servicePeriodStart: null, servicePeriodEnd: null, periodKey: { $in: utilityPeriodMonthKeys(servicePeriod) } },
  ] };
  if (await Charge.exists(duplicateUtilityFilter)) return res.status(409).json({ error: 'A utility charge of this type already exists for this service period.' });
  try {
    const charge = await inTransaction(async (session) => {
      const rangeLabel = utilityPeriodDescription(servicePeriod.servicePeriodStartText, servicePeriod.servicePeriodEndText);
      const [created] = await Charge.create([{ residentId: data.residentId, kind: 'UTILITY', utilityType: data.utilityType, periodKey: servicePeriod.periodKey, servicePeriodStart: servicePeriod.servicePeriodStart, servicePeriodEnd: servicePeriod.servicePeriodEnd, description: `${data.utilityType} · ${rangeLabel}${data.notes ? ` · ${data.notes}` : ''}`, amountPaise: paiseFromRupees(data.amount), issuedAt: data.issuedAt, dueAt: data.dueAt, idempotencyKey: utilityIdempotencyKey, createdBy: req.user!.id }], { session });
      await AuditEvent.create([{ actorId: req.user!.id, action: 'UTILITY_CHARGE_CREATED', entityType: 'Charge', entityId: String(created!._id), details: { residentId: data.residentId, amountPaise: created!.amountPaise, servicePeriodStart: servicePeriod.servicePeriodStart, servicePeriodEnd: servicePeriod.servicePeriodEnd } }], { session });
      return created!;
    });
    return res.status(201).json({ charge });
  } catch (error) { if ((error as { code?: number }).code === 11000) return res.status(200).json({ charge: await Charge.findOne({ idempotencyKey: utilityIdempotencyKey }) }); throw error; }
});

router.post('/deposits', requirePermission('payments:write'), async (req, res) => {
  const data = z.object({ residentId: id, amount: z.number().positive().max(10000000), kind: z.enum(['RECEIVED', 'REFUNDED']), paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'OTHER']), reference: z.string().max(120).default(''), reason: z.string().trim().min(5).max(1000), idempotencyKey: z.string().uuid() }).parse(req.body);
  if (!await residentIsInScope(req, data.residentId)) return res.status(403).json({ error: 'You do not have access to this resident’s property.' });
  const amountPaise = paiseFromRupees(data.amount);
  const result = await inTransaction(async (session) => {
    const resident = await Resident.findById(data.residentId).session(session); if (!resident) throw Object.assign(new Error('Resident not found.'), { status: 404 });
    const entries = await DepositTransaction.find({ residentId: resident._id }).session(session).lean();
    const balancePaise = entries.reduce((sum, entry) => sum + (entry.kind === 'RECEIVED' ? entry.amountPaise : ['REFUNDED', 'APPLIED'].includes(entry.kind) ? -entry.amountPaise : 0), 0);
    if (data.kind === 'REFUNDED' && amountPaise > balancePaise) throw Object.assign(new Error('Refund cannot exceed the security deposit currently held.'), { status: 409 });
    const idempotencyKey = `deposit:${data.idempotencyKey}`;
    const existing = await DepositTransaction.findOne({ idempotencyKey }).session(session); if (existing) return { transaction: existing, balancePaise };
    const transaction = (await DepositTransaction.create([{ residentId: resident._id, amountPaise, kind: data.kind, paymentMethod: data.paymentMethod, reference: data.reference, reason: data.reason, createdBy: req.user!.id, idempotencyKey }], { session }))[0]!;
    const newBalancePaise = balancePaise + (data.kind === 'RECEIVED' ? amountPaise : -amountPaise);
    await AuditEvent.create([{ actorId: req.user!.id, action: `SECURITY_DEPOSIT_${data.kind}`, entityType: 'DepositTransaction', entityId: String(transaction._id), reason: data.reason, details: { residentId: data.residentId, amountPaise, newBalancePaise, reference: data.reference } }], { session });
    return { transaction, balancePaise: newBalancePaise };
  });
  return res.status(201).json(result);
});

router.post('/billing/preview', requirePermission('billing:write'), async (req, res) => {
  const { periodKey, propertyId } = z.object({ periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), propertyId: id.optional() }).parse(req.body);
  if (propertyId && req.user?.role !== 'SUPER_ADMIN' && !(req.user?.propertyIds ?? []).includes(propertyId)) return res.status(403).json({ error: 'You do not have access to this property.' });
  if (propertyId && !await Property.exists({ _id: propertyId, active: true })) return res.status(404).json({ error: 'Active property not found.' });
  const assigned = req.user?.role === 'SUPER_ADMIN' ? undefined : req.user?.propertyIds ?? [];
  return res.json({ periodKey, propertyId: propertyId ?? null, ...(await previewMonthlyBilling(periodKey, propertyId, assigned)) });
});

router.post('/billing/generate', requirePermission('billing:write'), async (req, res) => {
  const { periodKey, propertyId } = z.object({ periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), propertyId: id.optional(), confirmed: z.literal(true) }).parse(req.body);
  if (propertyId && req.user?.role !== 'SUPER_ADMIN' && !(req.user?.propertyIds ?? []).includes(propertyId)) return res.status(403).json({ error: 'You do not have access to this property.' });
  if (propertyId && !await Property.exists({ _id: propertyId, active: true })) return res.status(404).json({ error: 'Active property not found.' });
  const assigned = req.user?.role === 'SUPER_ADMIN' ? undefined : req.user?.propertyIds ?? [];
  return res.json(await generateMonthlyBilling(periodKey, req.user!.id, propertyId, assigned));
});

router.patch('/charges/:id/adjust', requirePermission('billing:write'), async (req, res) => {
  const data = z.object({ amount: z.number().positive().max(10000000), reason: z.string().trim().min(5).max(1000) }).parse(req.body);
  const after = paiseFromRupees(data.amount);
  const charge = await inTransaction(async (session) => {
    const doc = await Charge.findById(req.params.id).session(session); if (!doc) throw Object.assign(new Error('Charge not found.'), { status: 404 });
    if (!await residentIsInScope(req, String(doc.residentId))) throw Object.assign(new Error('You do not have access to this resident’s property.'), { status: 403 });
    const before = doc.amountPaise;
    if (after < doc.paidPaise + (doc.externalPaidPaise ?? 0)) throw Object.assign(new Error('Adjusted charge cannot be lower than payments already recorded.'), { status: 409 });
    doc.amountPaise = after; doc.status = chargeStatus(after, doc.paidPaise + (doc.externalPaidPaise ?? 0), doc.dueAt); doc.audit.push({ at: new Date(), by: new Types.ObjectId(req.user!.id), action: 'ADJUSTED', reason: data.reason, beforePaise: before, afterPaise: after });
    await doc.save({ session });
    await AuditEvent.create([{ actorId: req.user!.id, action: 'CHARGE_ADJUSTED', entityType: 'Charge', entityId: String(doc._id), reason: data.reason, details: { beforePaise: before, afterPaise: after } }], { session });
    return doc;
  });
  return res.json({ charge });
});

router.get('/payments', requirePermission('payments:read'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const filter: Record<string, unknown> = {};
  if (req.query.residentId && id.safeParse(req.query.residentId).success) filter.residentId = req.query.residentId;
  const requestedPropertyId = req.query.propertyId && id.safeParse(req.query.propertyId).success ? String(req.query.propertyId) : undefined;
  const scope = await scopedResidentIds(req, requestedPropertyId);
  if (scope.forbidden) return res.status(403).json({ error: 'You do not have access to this property.' });
  if (scope.ids !== null) { const current = filter.residentId; filter.residentId = { $in: current ? scope.ids.filter((residentId) => String(residentId) === String(current)) : scope.ids }; }
  if (req.query.method && ['CASH', 'BANK_TRANSFER', 'UPI', 'OTHER'].includes(String(req.query.method))) filter.method = req.query.method;
  if (req.query.from || req.query.to) filter.paymentDate = { ...(req.query.from ? { $gte: rangeDate(req.query.from) } : {}), ...(req.query.to ? { $lte: rangeDate(req.query.to, true) } : {}) };
  const [payments, total] = await Promise.all([Payment.find(filter).populate('residentId', 'residentId fullName mobile').sort({ paymentDate: -1 }).skip((page - 1) * limit).limit(limit).lean(), Payment.countDocuments(filter)]);
  return res.json({ payments: payments.map((payment) => { const allocatedPaise = payment.reversedAt ? 0 : payment.allocations.reduce((sum, allocation) => sum + allocation.amountPaise, 0); const unallocatedPaise = payment.reversedAt ? 0 : payment.amountPaise - allocatedPaise; return { ...payment, allocatedPaise, unallocatedPaise, allocationStatus: payment.reversedAt ? 'REVERSED' : unallocatedPaise ? allocatedPaise ? 'PARTIALLY_ALLOCATED' : 'UNALLOCATED' : 'ALLOCATED' }; }), page, limit, total, pages: Math.ceil(total / limit) });
});

router.post('/payments', requirePermission('payments:write'), async (req, res) => {
  const data = z.object({ residentId: id, propertyId: id.optional(), amount: z.number().positive().max(10000000), paymentDate: day, method: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'OTHER']), reference: z.string().max(120).default(''), notes: z.string().max(1000).default(''), allocations: z.array(z.object({ chargeId: id, amount: z.number().positive() })).max(50).default([]).refine((values) => new Set(values.map((v) => v.chargeId)).size === values.length, 'A charge can only appear once per payment.'), idempotencyKey: z.string().uuid() }).parse(req.body);
  if (!await residentIsInScope(req, data.residentId)) return res.status(403).json({ error: 'You do not have access to this resident’s property.' });
  if (data.propertyId && req.user?.role !== 'SUPER_ADMIN' && !(req.user?.propertyIds ?? []).includes(data.propertyId)) return res.status(403).json({ error: 'You do not have access to this property.' });
  if (data.propertyId) { const property = await Property.findOne({ _id: data.propertyId, active: true }); const roomIds = await Room.distinct('_id', { propertyId: data.propertyId }); if (!property || !await RoomAllocation.exists({ residentId: data.residentId, roomId: { $in: roomIds }, active: true })) return res.status(422).json({ error: 'Choose a resident currently assigned to this property.' }); }
  const amountPaise = paiseFromRupees(data.amount); const allocations = data.allocations.map((a) => ({ chargeId: a.chargeId, amountPaise: paiseFromRupees(a.amount) }));
  if (allocations.reduce((sum, a) => sum + a.amountPaise, 0) > amountPaise) return res.status(422).json({ error: 'Payment allocations cannot exceed the payment amount.' });
  const key = `payment:${data.idempotencyKey}`;
  const already = await Payment.findOne({ idempotencyKey: key }); if (already) return res.json({ payment: already, duplicate: true });
  const payment = await inTransaction(async (session) => {
    const found = await Payment.findOne({ idempotencyKey: key }).session(session); if (found) return found;
    const chargeDocs: ChargeDocument[] = [];
    for (const allocation of allocations) {
      const charge = await Charge.findOne({ _id: allocation.chargeId, residentId: data.residentId }).session(session);
      if (!charge) throw Object.assign(new Error('A selected charge does not belong to this resident.'), { status: 422 });
      chargeDocs.push(charge as ChargeDocument);
    }
    try { validatePaymentAllocations(amountPaise, allocations.map((allocation, index) => ({ amountPaise: allocation.amountPaise, remainingPaise: chargeDocs[index]!.amountPaise - chargeDocs[index]!.paidPaise - (chargeDocs[index]!.externalPaidPaise ?? 0) }))); }
    catch (error) { throw Object.assign(error as Error, { status: 409 }); }
    for (const [index, charge] of chargeDocs.entries()) { charge.paidPaise += allocations[index]!.amountPaise; charge.status = chargeStatus(charge.amountPaise, charge.paidPaise + (charge.externalPaidPaise ?? 0), charge.dueAt); await charge.save({ session }); }
    const created = (await Payment.create([{ residentId: data.residentId, amountPaise, paymentDate: data.paymentDate, method: data.method, reference: data.reference, notes: data.notes, allocations, idempotencyKey: key, receivedBy: req.user!.id }], { session }))[0]!;
    await AuditEvent.create([{ actorId: req.user!.id, action: 'PAYMENT_RECORDED', entityType: 'Payment', entityId: String(created._id), details: { residentId: data.residentId, amountPaise } }], { session });
    return created;
  }).catch(async (error: unknown) => {
    if ((error as { code?: number }).code === 11000) { const retry = await Payment.findOne({ idempotencyKey: key }); if (retry) return retry; }
    throw error;
  });
  return res.status(201).json({ payment });
});

router.post('/payments/:id/allocate', requirePermission('payments:write'), async (req, res) => {
  const data = z.object({ allocations: z.array(z.object({ chargeId: id, amount: z.number().positive() })).min(1).max(50).refine((values) => new Set(values.map((v) => v.chargeId)).size === values.length, 'A charge can only appear once per allocation request.') }).parse(req.body);
  const additions = data.allocations.map((entry) => ({ chargeId: new Types.ObjectId(entry.chargeId), amountPaise: paiseFromRupees(entry.amount) }));
  const payment = await inTransaction(async (session) => {
    const doc = await Payment.findById(req.params.id).session(session); if (!doc) throw Object.assign(new Error('Payment not found.'), { status: 404 });
    if (!await residentIsInScope(req, String(doc.residentId))) throw Object.assign(new Error('You do not have access to this resident’s property.'), { status: 403 });
    if (doc.reversedAt) throw Object.assign(new Error('A reversed payment cannot receive allocations.'), { status: 409 });
    if (doc.allocations.some((existing) => additions.some((entry) => String(existing.chargeId) === String(entry.chargeId)))) throw Object.assign(new Error('This payment already has an allocation to the selected charge.'), { status: 409 });
    const alreadyAllocated = doc.allocations.reduce((sum, entry) => sum + entry.amountPaise, 0);
    const requested = additions.reduce((sum, entry) => sum + entry.amountPaise, 0);
    if (alreadyAllocated + requested > doc.amountPaise) throw Object.assign(new Error('Allocation exceeds the unallocated payment balance.'), { status: 409 });
    const charges: ChargeDocument[] = [];
    for (const allocation of additions) {
      const charge = await Charge.findOne({ _id: allocation.chargeId, residentId: doc.residentId }).session(session);
      if (!charge) throw Object.assign(new Error('A selected charge does not belong to this resident.'), { status: 422 });
      charges.push(charge as ChargeDocument);
    }
    try { validatePaymentAllocations(doc.amountPaise, additions.map((entry, index) => ({ amountPaise: entry.amountPaise, remainingPaise: charges[index]!.amountPaise - charges[index]!.paidPaise - (charges[index]!.externalPaidPaise ?? 0) }))); }
    catch (error) { throw Object.assign(error as Error, { status: 409 }); }
    for (const [index, charge] of charges.entries()) { charge.paidPaise += additions[index]!.amountPaise; charge.status = chargeStatus(charge.amountPaise, charge.paidPaise + (charge.externalPaidPaise ?? 0), charge.dueAt); await charge.save({ session }); }
    doc.allocations.push(...additions); await doc.save({ session });
    await AuditEvent.create([{ actorId: req.user!.id, action: 'PAYMENT_ALLOCATED', entityType: 'Payment', entityId: String(doc._id), details: { addedPaise: requested, chargeIds: additions.map((entry) => String(entry.chargeId)) } }], { session });
    return doc;
  });
  const allocatedPaise = payment.allocations.reduce((sum, entry) => sum + entry.amountPaise, 0);
  return res.json({ payment, allocatedPaise, unallocatedPaise: payment.amountPaise - allocatedPaise });
});

router.get('/payments/:id/receipt', requirePermission('payments:read'), async (req, res) => {
  const payment = await Payment.findById(req.params.id).populate('residentId', 'residentId fullName mobile securityDepositPaise rentSchedules').lean();
  if (!payment) return res.status(404).json({ error: 'Payment not found.' });
  if (!await residentIsInScope(req, String((payment.residentId as unknown as { _id: Types.ObjectId })._id))) return res.status(403).json({ error: 'You do not have access to this resident’s property.' });
  const [allocation, charges] = await Promise.all([
    RoomAllocation.findOne({ residentId: (payment.residentId as unknown as { _id: Types.ObjectId })._id, startDate: { $lte: payment.paymentDate }, $or: [{ endDate: null }, { endDate: { $gte: payment.paymentDate } }] }).sort({ startDate: -1 }).populate({ path: 'roomId', select: 'roomNumber propertyId propertyName', populate: { path: 'propertyId', select: 'name address' } }).lean(),
    Charge.find({ _id: { $in: payment.allocations.map((item) => item.chargeId) } }).select('kind utilityType periodKey servicePeriodStart servicePeriodEnd description amountPaise').lean(),
  ]);
  const chargeMap = new Map(charges.map((charge) => [String(charge._id), charge]));
  const receiptNumber = `ASH-${payment.paymentDate.getUTCFullYear()}-${String(payment._id).toUpperCase()}`;
  return res.json({ payment, receiptNumber, allocation, breakdown: payment.allocations.map((item) => ({ ...item, charge: chargeMap.get(String(item.chargeId)) ?? null })) });
});

router.post('/payments/:id/reverse', requirePermission('payments:write'), async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(5).max(1000) }).parse(req.body);
  const payment = await inTransaction(async (session) => {
    const doc = await Payment.findById(req.params.id).session(session); if (!doc) throw Object.assign(new Error('Payment not found.'), { status: 404 });
    if (!await residentIsInScope(req, String(doc.residentId))) throw Object.assign(new Error('You do not have access to this resident’s property.'), { status: 403 });
    if (doc.reversedAt) throw Object.assign(new Error('This payment has already been reversed.'), { status: 409 });
    for (const allocation of doc.allocations) {
      const charge = await Charge.findById(allocation.chargeId).session(session); if (!charge) throw Object.assign(new Error('Allocated charge is missing; reversal was not completed.'), { status: 409 });
      if (charge.paidPaise < allocation.amountPaise) throw Object.assign(new Error('The charge ledger no longer reconciles with this payment; reversal was not completed.'), { status: 409 });
      charge.paidPaise -= allocation.amountPaise; charge.status = chargeStatus(charge.amountPaise, charge.paidPaise, charge.dueAt); await charge.save({ session });
    }
    doc.reversedAt = new Date(); doc.reversalReason = reason; doc.reversedBy = new Types.ObjectId(req.user!.id); await doc.save({ session });
    await AuditEvent.create([{ actorId: req.user!.id, action: 'PAYMENT_REVERSED', entityType: 'Payment', entityId: String(doc._id), reason, details: { amountPaise: doc.amountPaise } }], { session });
    return doc;
  });
  return res.json({ payment });
});

export default router;
