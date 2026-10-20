import argon2 from 'argon2';
import mongoose from 'mongoose';
import supertest, { type Agent } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../app.js';
import { connectDatabase } from '../config/database.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { Charge } from '../models/Charge.js';
import { Property } from '../models/Property.js';
import { Resident } from '../models/Resident.js';
import { ResidentTransferHistory } from '../models/ResidentTransferHistory.js';
import { Room } from '../models/Room.js';
import { RoomAllocation } from '../models/RoomAllocation.js';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { availability } from '../runtime/availability.js';

// Runs only against a disposable loopback replica set validated in test/setup.ts.
const enabled = Boolean(process.env.STABILITY_TEST_MONGODB_URI);
describe.skipIf(!enabled)('resident assignment transfer integration', () => {
  let owner: InstanceType<typeof User>;
  let client: Agent;
  let csrfToken: string;
  let sequence = 0;

  beforeAll(async () => {
    await connectDatabase();
    await Promise.all([User.init(), Session.init(), Property.init(), Room.init(), Resident.init(), RoomAllocation.init(), ResidentTransferHistory.init(), Charge.init(), AuditEvent.init()]);
    owner = await User.create({ name: 'Transfer Test Owner', email: 'transfer-owner@example.invalid', passwordHash: await argon2.hash('transfer-test-password'), role: 'SUPER_ADMIN', permissions: [], active: true });
    availability.markInitialized();
    client = supertest.agent(app);
    const csrf = await client.get('/api/auth/csrf');
    csrfToken = csrf.body.csrfToken as string;
    const login = await client.post('/api/auth/login').set('X-CSRF-Token', csrfToken).send({ email: owner.email, password: 'transfer-test-password' });
    expect(login.status).toBe(200);
  }, 30_000);

  afterAll(async () => {
    availability.beginShutdown();
    try { if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase(); }
    finally { await mongoose.disconnect(); }
  }, 30_000);

  async function makeAssignment(options: { property?: InstanceType<typeof Property>; room?: InstanceType<typeof Room>; gender?: 'MALE' | 'FEMALE'; secondRoom?: boolean } = {}) {
    const id = ++sequence;
    const sourceProperty = options.property ?? await Property.create({ name: `Transfer Home ${id}`, gender: options.gender ?? 'MALE', createdBy: owner._id });
    const sourceRoom = options.room ?? await Room.create({ propertyId: sourceProperty._id, propertyName: sourceProperty.name, roomNumber: `S-${id}`, roomType: 'NON_AC', capacity: 2, beds: [{ bedId: '01', active: true }, { bedId: '02', active: true }] });
    const resident = await Resident.create({ residentId: `TRANSFER-${id}`, admissionIdempotencyKey: `transfer-key-${id}`, fullName: `Transfer Resident ${id}`, mobile: `9000000${String(id).padStart(3, '0')}`, admissionDate: new Date('2024-01-05T00:00:00Z'), billingStartDate: new Date('2024-01-05T00:00:00Z'), status: 'ACTIVE', securityDepositPaise: 1500000, createdBy: owner._id, gender: options.gender ?? 'MALE' });
    const allocation = await RoomAllocation.create({ residentId: resident._id, roomId: sourceRoom._id, bedId: '01', startDate: new Date('2024-01-05T00:00:00Z'), changedBy: owner._id });
    resident.allocations.push({ roomId: sourceRoom._id, roomNumber: sourceRoom.roomNumber, bedId: '01', startDate: allocation.startDate, changedBy: owner._id });
    await resident.save();
    const destinationRoom = options.secondRoom ? await Room.create({ propertyId: sourceProperty._id, propertyName: sourceProperty.name, roomNumber: `D-${id}`, roomType: 'NON_AC', capacity: 2, beds: [{ bedId: '01', active: true }, { bedId: '02', active: true }] }) : sourceRoom;
    const destinationProperty = await Property.create({ name: `Transfer Destination ${id}`, gender: options.gender ?? 'MALE', createdBy: owner._id });
    const otherPropertyRoom = await Room.create({ propertyId: destinationProperty._id, propertyName: destinationProperty.name, roomNumber: `P-${id}`, roomType: 'NON_AC', capacity: 2, beds: [{ bedId: '01', active: true }, { bedId: '02', active: true }] });
    return { resident, sourceProperty, sourceRoom, destinationRoom, destinationProperty, otherPropertyRoom };
  }

  async function transfer(residentId: string, propertyId: string, roomId: string, bedId: string) {
    return client.post(`/api/residents/${residentId}/transfers`).set('X-CSRF-Token', csrfToken).send({ propertyId, roomId, bedId, reason: 'Local integration test' });
  }

  it('records bed switches, room switches and property transfers without changing financial records', async () => {
    const fixture = await makeAssignment({ secondRoom: true });
    const charge = await Charge.create({ residentId: fixture.resident._id, kind: 'RENT', periodKey: '2026-10', description: 'Test rent', amountPaise: 2500000, paidPaise: 500000, status: 'PARTIAL', issuedAt: new Date(), dueAt: new Date(), createdBy: owner._id, idempotencyKey: `transfer-charge-${fixture.resident._id}`, audit: [] });
    const beforeDeposit = fixture.resident.securityDepositPaise;
    const bedSwitch = await transfer(String(fixture.resident._id), String(fixture.sourceProperty._id), String(fixture.sourceRoom._id), '02');
    expect(bedSwitch.status).toBe(201);
    const roomSwitch = await transfer(String(fixture.resident._id), String(fixture.sourceProperty._id), String(fixture.destinationRoom._id), '01');
    expect(roomSwitch.status).toBe(201);
    const propertySwitch = await transfer(String(fixture.resident._id), String(fixture.destinationProperty._id), String(fixture.otherPropertyRoom._id), '01');
    expect(propertySwitch.status).toBe(201);
    const history = await ResidentTransferHistory.find({ residentId: fixture.resident._id }).sort({ recordedAt: 1 }).lean();
    expect(history.map((item) => item.transferType)).toEqual(['BED_SWITCH', 'ROOM_SWITCH', 'PROPERTY_TRANSFER']);
    expect(history[2]?.from.propertyName).toBe(fixture.sourceProperty.name);
    expect(history[2]?.to.propertyName).toBe(fixture.destinationProperty.name);
    expect(history.every((item) => item.transferReference)).toBe(true);
    const active = await RoomAllocation.find({ residentId: fixture.resident._id, active: true });
    expect(active).toHaveLength(1);
    expect(String(active[0]?.roomId)).toBe(String(fixture.otherPropertyRoom._id));
    const savedCharge = await Charge.findById(charge._id).lean();
    const savedResident = await Resident.findById(fixture.resident._id).lean();
    expect(savedCharge?.amountPaise).toBe(2500000);
    expect(savedCharge?.paidPaise).toBe(500000);
    expect(savedResident?.securityDepositPaise).toBe(beforeDeposit);
  });

  it('rejects an occupied bed, a mismatched property/room and a gender-incompatible property', async () => {
    const fixture = await makeAssignment();
    const occupyingResident = await Resident.create({ residentId: `OCCUPY-${sequence}`, admissionIdempotencyKey: `occupy-key-${sequence}`, fullName: `Occupying Resident ${sequence}`, mobile: `8000000${String(sequence).padStart(3, '0')}`, admissionDate: new Date('2024-01-05T00:00:00Z'), billingStartDate: new Date('2024-01-05T00:00:00Z'), status: 'ACTIVE', securityDepositPaise: 0, createdBy: owner._id, gender: 'MALE' });
    await RoomAllocation.create({ residentId: occupyingResident._id, roomId: fixture.sourceRoom._id, bedId: '02', startDate: new Date(), changedBy: owner._id });
    const occupied = await transfer(String(fixture.resident._id), String(fixture.sourceProperty._id), String(fixture.sourceRoom._id), '02');
    expect(occupied.status).toBe(409);
    const mismatch = await transfer(String(fixture.resident._id), String(fixture.destinationProperty._id), String(fixture.sourceRoom._id), '02');
    expect(mismatch.status).toBe(422);
    const female = await Property.create({ name: 'Female destination', gender: 'FEMALE', createdBy: owner._id });
    const femaleRoom = await Room.create({ propertyId: female._id, propertyName: female.name, roomNumber: 'F-1', roomType: 'NON_AC', capacity: 1, beds: [{ bedId: '01', active: true }] });
    const wrongGender = await transfer(String(fixture.resident._id), String(female._id), String(femaleRoom._id), '01');
    expect(wrongGender.status).toBe(422);
    const unchanged = await RoomAllocation.findOne({ residentId: fixture.resident._id, active: true });
    expect(String(unchanged?.roomId)).toBe(String(fixture.sourceRoom._id));
    expect(await ResidentTransferHistory.countDocuments({ residentId: fixture.resident._id })).toBe(0);
  });

  it('does not expose a destination property to a staff member without its property scope', async () => {
    const fixture = await makeAssignment();
    const staff = await User.create({ name: 'Scoped Transfer Staff', email: `transfer-staff-${sequence + 1}@example.invalid`, passwordHash: await argon2.hash('transfer-test-password'), role: 'STAFF', permissions: ['residents:write'], propertyIds: [fixture.sourceProperty._id], active: true });
    const scopedClient = supertest.agent(app);
    const csrf = await scopedClient.get('/api/auth/csrf');
    const login = await scopedClient.post('/api/auth/login').set('X-CSRF-Token', csrf.body.csrfToken as string).send({ email: staff.email, password: 'transfer-test-password' });
    expect(login.status).toBe(200);
    const response = await scopedClient.post(`/api/residents/${fixture.resident._id}/transfers`).set('X-CSRF-Token', csrf.body.csrfToken as string).send({ propertyId: String(fixture.destinationProperty._id), roomId: String(fixture.otherPropertyRoom._id), bedId: '01' });
    expect(response.status).toBe(403);
    expect(await ResidentTransferHistory.countDocuments({ residentId: fixture.resident._id })).toBe(0);
  });

  it('rolls back the assignment if transfer history cannot be saved', async () => {
    const fixture = await makeAssignment();
    const targetRoom = await Room.create({ propertyId: fixture.destinationProperty._id, propertyName: fixture.destinationProperty.name, roomNumber: 'R'.repeat(41), roomType: 'NON_AC', capacity: 1, beds: [{ bedId: '01', active: true }] });
    const response = await transfer(String(fixture.resident._id), String(fixture.destinationProperty._id), String(targetRoom._id), '01');
    expect(response.status).toBe(500);
    const active = await RoomAllocation.find({ residentId: fixture.resident._id, active: true });
    expect(active).toHaveLength(1);
    expect(String(active[0]?.roomId)).toBe(String(fixture.sourceRoom._id));
    expect(await ResidentTransferHistory.countDocuments({ residentId: fixture.resident._id })).toBe(0);
  });

  it('allows only one of two concurrent attempts to claim the same destination bed', async () => {
    const first = await makeAssignment();
    const second = await makeAssignment();
    const property = await Property.create({ name: `Shared destination ${sequence}`, gender: 'MALE', createdBy: owner._id });
    const room = await Room.create({ propertyId: property._id, propertyName: property.name, roomNumber: 'SHARED', roomType: 'NON_AC', capacity: 1, beds: [{ bedId: '01', active: true }] });
    const results = await Promise.all([
      transfer(String(first.resident._id), String(property._id), String(room._id), '01'),
      transfer(String(second.resident._id), String(property._id), String(room._id), '01'),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await RoomAllocation.countDocuments({ roomId: room._id, bedId: '01', active: true })).toBe(1);
  });
});
