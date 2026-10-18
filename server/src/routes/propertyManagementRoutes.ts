import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Property } from '../models/Property.js';
import { Room } from '../models/Room.js';
import { RoomAllocation } from '../models/RoomAllocation.js';
import { Resident } from '../models/Resident.js';
import { Charge } from '../models/Charge.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { chargeBalance } from '../services/financialCalculations.js';
import { businessMonthRange, rentChargeMongoFilter } from '../services/rentStatus.js';

const router = Router();
router.use(requireAuth);
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const propertyInput = z.object({ name: z.string().trim().min(2).max(160), address: z.string().max(500).default(''), contactPhone: z.string().max(30).default(''), contactEmail: z.string().email().max(254).or(z.literal('')).default(''), notes: z.string().max(2000).default('') });

router.get('/properties', requirePermission('rooms:read'), async (req, res) => {
  const properties = await Property.find(req.user!.role === 'SUPER_ADMIN' ? {} : { _id: { $in: req.user!.propertyIds ?? [] } }).sort({ active: -1, name: 1 }).lean();
  const now = new Date(); const { start: monthStart, end: monthEnd } = businessMonthRange(now);
  const rooms = await Room.find().select('_id propertyId capacity active').lean();
  const allocations = await RoomAllocation.find({ active: true }).select('roomId residentId').lean();
  const residentIds = [...new Set(allocations.map((item) => String(item.residentId)))].map((id) => new Types.ObjectId(id));
  const activeResidents = await Resident.find({ _id: { $in: residentIds }, status: 'ACTIVE' }).select('_id').lean();
  const chargeRows = await Charge.aggregate([
    { $match: { dueAt: { $gte: monthStart, $lt: monthEnd } } },
    { $lookup: { from: 'residents', localField: 'residentId', foreignField: '_id', as: 'resident' } }, { $unwind: '$resident' },
    { $unwind: '$resident.allocations' }, { $match: { 'resident.allocations.endDate': null } },
    { $lookup: { from: 'rooms', localField: 'resident.allocations.roomId', foreignField: '_id', as: 'room' } }, { $unwind: '$room' },
    { $group: { _id: { propertyId: '$room.propertyId', kind: '$kind' }, billed: { $sum: '$amountPaise' }, outstanding: { $sum: { $max: [0, { $subtract: ['$amountPaise', { $add: ['$paidPaise', { $ifNull: ['$externalPaidPaise', 0] }] }] }] } } } },
  ]);
  const collectedRows = await (await import('../models/Payment.js')).Payment.aggregate([
    { $match: { paymentDate: { $gte: monthStart, $lt: monthEnd }, reversedAt: null } }, { $unwind: '$allocations' },
    { $lookup: { from: 'charges', localField: 'allocations.chargeId', foreignField: '_id', as: 'charge' } }, { $unwind: '$charge' },
    { $match: { 'charge.kind': 'RENT' } },
    { $lookup: { from: 'residents', localField: 'residentId', foreignField: '_id', as: 'resident' } }, { $unwind: '$resident' },
    { $unwind: '$resident.allocations' }, { $match: { 'resident.allocations.endDate': null } },
    { $lookup: { from: 'rooms', localField: 'resident.allocations.roomId', foreignField: '_id', as: 'room' } }, { $unwind: '$room' },
    { $group: { _id: '$room.propertyId', total: { $sum: '$allocations.amountPaise' } } },
  ]);
  const roomById = new Map(rooms.map((room) => [String(room._id), room]));
  const occupiedByProperty = new Map<string, number>(); const residentsByProperty = new Map<string, Set<string>>();
  for (const allocation of allocations) { const room = roomById.get(String(allocation.roomId)); if (!room?.propertyId) continue; const key = String(room.propertyId); occupiedByProperty.set(key, (occupiedByProperty.get(key) ?? 0) + 1); const set = residentsByProperty.get(key) ?? new Set<string>(); if (activeResidents.some((r) => String(r._id) === String(allocation.residentId))) set.add(String(allocation.residentId)); residentsByProperty.set(key, set); }
  const emptyFinancials = () => ({ rentBilledPaise: 0, rentCollectedPaise: 0, rentOutstandingPaise: 0, utilityOutstandingPaise: 0, openingBalanceOutstandingPaise: 0, totalOutstandingRentPaise: 0 });
  const financials = new Map<string, ReturnType<typeof emptyFinancials>>();
  for (const row of chargeRows) { if (!row._id.propertyId) continue; const key = String(row._id.propertyId); const value = financials.get(key) ?? emptyFinancials(); if (row._id.kind === 'RENT') { value.rentBilledPaise += row.billed; value.rentOutstandingPaise += row.outstanding; } else if (row._id.kind === 'UTILITY') value.utilityOutstandingPaise += row.outstanding; financials.set(key, value); }
  for (const row of collectedRows) { if (!row._id) continue; const key = String(row._id); const value = financials.get(key) ?? emptyFinancials(); value.rentCollectedPaise = row.total; financials.set(key, value); }
  const residentProperty = new Map<string, string>();
  for (const allocation of allocations) { const room = roomById.get(String(allocation.roomId)); if (room?.propertyId) residentProperty.set(String(allocation.residentId), String(room.propertyId)); }
  const overdueCharges = await Charge.find({ kind: 'RENT', ...rentChargeMongoFilter('OVERDUE', now), residentId: { $in: [...residentProperty.keys()] } }).lean();
  const overdueByProperty = new Map<string, { amountPaise: number; residents: Set<string> }>();
  for (const charge of overdueCharges) { const key = residentProperty.get(String(charge.residentId)); if (!key) continue; const item = overdueByProperty.get(key) ?? { amountPaise: 0, residents: new Set<string>() }; item.amountPaise += chargeBalance(charge); item.residents.add(String(charge.residentId)); overdueByProperty.set(key, item); }
  const allRentBalances = await Charge.find({ kind: { $in: ['RENT', 'OPENING_BALANCE'] }, residentId: { $in: [...residentProperty.keys()] } }).lean();
  for (const charge of allRentBalances) { const key = residentProperty.get(String(charge.residentId)); if (!key) continue; const value = financials.get(key) ?? emptyFinancials(); const balance = chargeBalance(charge); if (charge.kind === 'RENT') value.totalOutstandingRentPaise += balance; else value.openingBalanceOutstandingPaise += balance; financials.set(key, value); }
  const cards = properties.map((property) => { const key = String(property._id); const scopedRooms = rooms.filter((room) => String(room.propertyId ?? '') === key); const bedCount = scopedRooms.filter((room) => room.active).reduce((sum, room) => sum + room.capacity, 0); const occupiedBeds = occupiedByProperty.get(key) ?? 0; const overdue = overdueByProperty.get(key); const propertyFinancials = financials.get(key) ?? emptyFinancials(); return { ...property, totalRooms: scopedRooms.length, totalBeds: bedCount, occupiedBeds, vacantBeds: Math.max(0, bedCount - occupiedBeds), activeResidents: residentsByProperty.get(key)?.size ?? 0, financials: { ...propertyFinancials, overdueRentPaise: overdue?.amountPaise ?? 0, overdueResidentCount: overdue?.residents.size ?? 0 } }; });
  const unassignedRooms = req.user!.role === 'SUPER_ADMIN' ? rooms.filter((room) => !room.propertyId).length : 0;
  return res.json({ properties: cards, unassignedRooms, periodKey: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(now).filter((part) => part.type === 'year' || part.type === 'month').map((part) => part.value).join('-') });
});

router.post('/properties', requirePermission('rooms:write'), requireRole('SUPER_ADMIN'), async (req, res) => {
  const data = propertyInput.parse(req.body);
  const property = await Property.create({ ...data, contactEmail: data.contactEmail.toLowerCase(), createdBy: req.user!.id });
  await AuditEvent.create({ actorId: req.user!.id, action: 'PROPERTY_CREATED', entityType: 'Property', entityId: String(property._id) });
  return res.status(201).json({ property });
});

router.put('/properties/:id', requirePermission('rooms:write'), requireRole('SUPER_ADMIN'), async (req, res) => {
  const data = propertyInput.parse(req.body); const property = await Property.findByIdAndUpdate(req.params.id, { $set: { ...data, contactEmail: data.contactEmail.toLowerCase() } }, { new: true, runValidators: true });
  if (!property) return res.status(404).json({ error: 'Property not found.' });
  await Room.updateMany({ propertyId: property._id }, { $set: { propertyName: property.name } });
  await AuditEvent.create({ actorId: req.user!.id, action: 'PROPERTY_UPDATED', entityType: 'Property', entityId: String(property._id) });
  return res.json({ property });
});

router.patch('/properties/:id/deactivate', requirePermission('rooms:write'), requireRole('SUPER_ADMIN'), async (req, res) => {
  const property = await Property.findById(req.params.id); if (!property) return res.status(404).json({ error: 'Property not found.' });
  const roomIds = await Room.distinct('_id', { propertyId: property._id });
  if (await RoomAllocation.exists({ roomId: { $in: roomIds }, active: true })) return res.status(409).json({ error: 'Move residents out of this property before deactivating it.' });
  if (await Room.exists({ propertyId: property._id, active: true })) return res.status(409).json({ error: 'Deactivate its active rooms before deactivating the property.' });
  property.active = false; await property.save();
  await AuditEvent.create({ actorId: req.user!.id, action: 'PROPERTY_DEACTIVATED', entityType: 'Property', entityId: String(property._id) });
  return res.json({ property });
});

// Explicitly reviewed mapping for old rooms. No legacy property is inferred by the server.
router.post('/properties/:id/assign-room', requirePermission('rooms:write'), requireRole('SUPER_ADMIN'), async (req, res) => {
  const { roomId, reason } = z.object({ roomId: objectId, reason: z.string().trim().min(5).max(500) }).parse(req.body);
  const property = await Property.findOne({ _id: req.params.id, active: true }); const room = await Room.findById(roomId);
  if (!property || !room) return res.status(404).json({ error: 'Property or room not found.' });
  room.propertyId = property._id; room.propertyName = property.name;
  try { await room.save(); } catch (error) { if ((error as { code?: number }).code === 11000) return res.status(409).json({ error: 'That room number already exists in this property.' }); throw error; }
  await AuditEvent.create({ actorId: req.user!.id, action: 'LEGACY_ROOM_ASSIGNED_TO_PROPERTY', entityType: 'Room', entityId: String(room._id), reason, details: { propertyId: String(property._id), propertyName: property.name } });
  return res.json({ room });
});

export default router;
