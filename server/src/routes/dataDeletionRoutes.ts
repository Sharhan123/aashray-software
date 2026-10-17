import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { Resident } from '../models/Resident.js';
import { Property } from '../models/Property.js';
import { Room } from '../models/Room.js';
import { RoomAllocation } from '../models/RoomAllocation.js';
import { Charge } from '../models/Charge.js';
import { Payment } from '../models/Payment.js';
import { DepositTransaction } from '../models/DepositTransaction.js';
import { ResidentMigration } from '../models/ResidentMigration.js';
import { MessageLog } from '../models/MessageLog.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { inTransaction } from '../services/transactions.js';

const router = Router();
router.use(requireAuth, requireRole('SUPER_ADMIN'));

const operationalModels = { properties: Property, rooms: Room, residents: Resident, roomAllocations: RoomAllocation, charges: Charge, payments: Payment, deposits: DepositTransaction, migrations: ResidentMigration, messages: MessageLog };
async function getOperationalCounts() {
  const entries = await Promise.all(Object.entries(operationalModels).map(async ([name, collection]) => [name, await collection.countDocuments()] as const));
  return Object.fromEntries(entries);
}

router.get('/admin/operational-data/summary', async (_req, res) => {
  return res.json({ counts: await getOperationalCounts(), warning: 'Delete all permanently removes residents, properties, rooms, financial records, message history, staff accounts, and prior audit history. Your Super Admin account and business settings are kept.' });
});

router.delete('/residents/:id', async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(5).max(500) }).parse(req.body);
  const resident = await Resident.findById(req.params.id).select('_id');
  if (!resident) return res.status(404).json({ error: 'Resident not found.' });
  const filter = { residentId: resident._id };
  const counts = { charges: await Charge.countDocuments(filter), payments: await Payment.countDocuments(filter), deposits: await DepositTransaction.countDocuments(filter), migrations: await ResidentMigration.countDocuments(filter), allocations: await RoomAllocation.countDocuments(filter), messages: await MessageLog.countDocuments(filter) };
  await inTransaction(async (session) => {
    await Charge.deleteMany(filter).session(session);
    await Payment.deleteMany(filter).session(session);
    await DepositTransaction.deleteMany(filter).session(session);
    await ResidentMigration.deleteMany(filter).session(session);
    await RoomAllocation.deleteMany(filter).session(session);
    await MessageLog.deleteMany(filter).session(session);
    await AuditEvent.deleteMany({ entityType: 'Resident', entityId: String(resident._id) }).session(session);
    await Resident.deleteOne({ _id: resident._id }).session(session);
    await AuditEvent.create([{ actorId: req.user!.id, action: 'RESIDENT_PERMANENTLY_DELETED', entityType: 'Resident', entityId: String(resident._id), reason, details: counts }], { session });
  });
  return res.json({ deleted: true, counts });
});

router.delete('/properties/:id', async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(5).max(500) }).parse(req.body);
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ error: 'Property not found.' });
  const roomIds = await Room.distinct('_id', { propertyId: property._id });
  const activeResidents = await RoomAllocation.countDocuments({ roomId: { $in: roomIds }, active: true });
  if (activeResidents) return res.status(409).json({ error: 'Move or check out all residents before deleting this property. Resident and financial records are preserved.' });
  await inTransaction(async (session) => {
    // Keep room and resident history intact while removing the parent property reference.
    await Room.updateMany({ propertyId: property._id }, { $set: { propertyId: null, propertyName: `Former property: ${property.name}` } }, { session });
    await Property.deleteOne({ _id: property._id }).session(session);
    await AuditEvent.create([{ actorId: req.user!.id, action: 'PROPERTY_DELETED', entityType: 'Property', entityId: String(property._id), reason, details: { preservedRooms: roomIds.length } }], { session });
  });
  return res.json({ deleted: true, preservedRooms: roomIds.length });
});

router.delete('/admin/operational-data', async (req, res) => {
  const { confirmation, reason } = z.object({ confirmation: z.literal('DELETE ALL'), reason: z.string().trim().min(5).max(500) }).parse(req.body);
  if (confirmation !== 'DELETE ALL') return res.status(422).json({ error: 'Type DELETE ALL to confirm.' });
  const counts = await getOperationalCounts();
  const staffIds = await User.distinct('_id', { role: 'STAFF' });
  const auditCount = await AuditEvent.countDocuments();
  await inTransaction(async (session) => {
    await Property.deleteMany({}).session(session);
    await Room.deleteMany({}).session(session);
    await Resident.deleteMany({}).session(session);
    await RoomAllocation.deleteMany({}).session(session);
    await Charge.deleteMany({}).session(session);
    await Payment.deleteMany({}).session(session);
    await DepositTransaction.deleteMany({}).session(session);
    await ResidentMigration.deleteMany({}).session(session);
    await MessageLog.deleteMany({}).session(session);
    await AuditEvent.deleteMany({}).session(session);
    await Session.deleteMany({ userId: { $in: staffIds } }).session(session);
    await User.deleteMany({ role: 'STAFF' }).session(session);
    await AuditEvent.create([{ actorId: req.user!.id, action: 'OPERATIONAL_DATA_PURGED', entityType: 'Workspace', entityId: 'operational-data', reason, details: { ...counts, priorAuditEvents: auditCount, staffAccountsDeleted: staffIds.length } }], { session });
  });
  return res.json({ deleted: true, counts, staffAccountsDeleted: staffIds.length, auditEventsRemoved: auditCount });
});

export default router;
