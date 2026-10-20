import { Writable } from 'node:stream';
import express from 'express';
import pino from 'pino';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { requestLogging } from './requestLogging.js';
import { asyncHandler } from './asyncHandler.js';
import { errorHandler } from './errors.js';

describe('safe request logging', () => {
  it('correlates errors and durations without logging credentials or personal information', async () => {
    let output = '';
    const stream = new Writable({ write(chunk, _encoding, done) { output += chunk.toString(); done(); } });
    const app = express();
    app.use(requestLogging(pino({ level: 'info' }, stream)));
    app.use(express.json());
    app.post('/resident/:id', asyncHandler(async () => {
      throw Object.assign(new Error('secret-uri mongodb://private-password@host'), { name: 'MongoNetworkError' });
    }));
    app.use(errorHandler);
    const response = await supertest(app).post('/resident/private-resident?name=private-name')
      .set('Authorization', 'Bearer private-token')
      .set('Cookie', 'session=private-cookie')
      .set('X-CSRF-Token', 'private-csrf')
      .set('X-Vercel-Proxy-Signature', 'private-signature')
      .set('X-Request-ID', 'private-inbound-id')
      .send({ email: 'private-email', password: 'private-password' });
    const id = response.headers['x-request-id'];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.status).toBe(503);
    expect(output).not.toMatch(/private-|secret-uri|mongodb:|authorization|cookie/i);
    const entries = output.trim().split('\n').map((line) => JSON.parse(line));
    expect(entries.every((entry) => entry.req.id === id)).toBe(true);
    expect(entries.some((entry) => entry.category === 'infrastructure')).toBe(true);
    expect(entries.find((entry) => entry.event === 'database_request_failed')).toMatchObject({
      requestId: id, method: 'POST', route: '/resident/:id', statusCode: 503,
      durationMs: expect.any(Number), gitCommit: expect.any(String),
      processStartId: expect.any(String), uptimeSeconds: expect.any(Number), databaseState: expect.any(String),
    });
    expect(entries.some((entry) => entry.route === '/resident/:id' && entry.responseTime >= 0 && entry.res.statusCode === 503)).toBe(true);
  });
});
