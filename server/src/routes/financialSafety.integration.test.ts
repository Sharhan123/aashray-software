import argon2 from 'argon2';
import mongoose from 'mongoose';
import supertest, { type Agent } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../app.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { Payment } from '../models/Payment.js';
import { Resident } from '../models/Resident.js';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { connectDatabase } from '../config/database.js';
import { availability } from '../runtime/availability.js';

// Opt in only with an isolated, local replica set validated by test/setup.ts.
// This suite drops its disposable database so transactions can be tested safely.
const enabled = Boolean(process.env.STABILITY_TEST_MONGODB_URI);
describe.skipIf(!enabled)('disposable MongoDB financial safety integration', () => {
  let client: Agent;
  let resident: InstanceType<typeof Resident>;
  let adminId: mongoose.Types.ObjectId;
  let csrfToken: string;
  let appReady = false;

  beforeAll(async () => {
    await connectDatabase();
    await Promise.all([User.init(), Session.init(), Resident.init(), Payment.init(), AuditEvent.init()]);
    const admin = await User.create({
      name: 'Disposable Test Admin', email: 'stability-test@example.invalid',
      passwordHash: await argon2.hash('disposable-password-only'),
      role: 'SUPER_ADMIN', permissions: [], active: true,
    });
    adminId = admin._id;
    resident = await Resident.create({
      residentId: 'STABILITY-TEST-ONLY',
      admissionIdempotencyKey: crypto.randomUUID(),
      fullName: 'Disposable Test Resident', mobile: '0000000000',
      admissionDate: new Date('2026-10-01T00:00:00.000Z'),
      billingStartDate: new Date('2026-10-01T00:00:00.000Z'),
      status: 'ACTIVE', securityDepositPaise: 0, createdBy: adminId,
    });
    availability.markInitialized();
    appReady = true;
    client = supertest.agent(app);
    const csrf = await client.get('/api/auth/csrf');
    csrfToken = csrf.body.csrfToken as string;
    const login = await client.post('/api/auth/login')
      .set('X-CSRF-Token', csrfToken)
      .send({ email: 'stability-test@example.invalid', password: 'disposable-password-only' });
    expect(login.status).toBe(200);
  }, 30_000);

  afterAll(async () => {
    if (appReady) availability.beginShutdown();
    try {
      if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  }, 30_000);

  it('records one idempotent payment and reads its saved receipt after a retry', async () => {
    const idempotencyKey = crypto.randomUUID();
    const paymentBody = {
      residentId: String(resident._id), amount: 12.34,
      paymentDate: '2026-10-20', method: 'CASH',
      reference: 'local disposable integration', notes: '',
      allocations: [], idempotencyKey,
    };
    const first = await client.post('/api/payments').set('X-CSRF-Token', csrfToken).send(paymentBody);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.payment.amountPaise).toBe(1234);
    const repeated = await client.post('/api/payments').set('X-CSRF-Token', csrfToken).send(paymentBody);
    expect(repeated.status).toBe(200);
    expect(repeated.body.duplicate).toBe(true);
    expect(String(repeated.body.payment._id)).toBe(String(first.body.payment._id));
    expect(await Payment.countDocuments({ idempotencyKey: `payment:${idempotencyKey}` })).toBe(1);
    const receipt = await client.get(`/api/payments/${first.body.payment._id}/receipt`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.payment.amountPaise).toBe(1234);
    expect(receipt.body.receiptNumber).toMatch(/^ASH-2026-/);
  });
});
