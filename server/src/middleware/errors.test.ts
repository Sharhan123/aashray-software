import express from 'express';
import supertest from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { asyncHandler } from './asyncHandler.js';
import { errorHandler, notFound } from './errors.js';
import { isDatabaseError, safeError } from '../config/safeError.js';

function failingApp(error: unknown) {
  const app = express();
  app.get('/fail', asyncHandler(async () => { throw error; }));
  app.get('/alive', (_req, res) => res.json({ status: 'ok' }));
  app.use(errorHandler);
  return app;
}
describe('controlled request errors', () => {
  it.each(['MongoNetworkError', 'MongoNetworkTimeoutError', 'MongooseServerSelectionError', 'MongoWaitQueueTimeoutError'])('returns sanitized 503 for %s and remains responsive', async (name) => {
    const app = failingApp(Object.assign(new Error('mongodb://secret:user@host/private'), { name }));
    expect((await supertest(app).get('/fail')).body).toEqual({ error: 'Service temporarily unavailable. Please try again shortly.' });
    expect((await supertest(app).get('/fail')).status).toBe(503);
    expect((await supertest(app).get('/alive')).status).toBe(200);
  });
  it('returns generic 500 for unexpected database query failures', async () => {
    const app = failingApp(Object.assign(new Error('sensitive query'), { name: 'MongoServerError', code: 2 }));
    const response = await supertest(app).get('/fail');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'An unexpected error occurred.' });
    expect(isDatabaseError(Object.assign(new Error('query failed'), { name: 'MongoServerError' }))).toBe(true);
    expect(isDatabaseError(new Error('application failure'))).toBe(false);
  });
  it('preserves explicit application errors and duplicate key contracts', async () => {
    const explicit = await supertest(failingApp(Object.assign(new Error('Review allocation.'), { status: 422 }))).get('/fail');
    expect(explicit.status).toBe(422);
    expect(explicit.body).toEqual({ error: 'Review allocation.' });
    const duplicate = await supertest(failingApp({ code: 11000, message: 'private email' })).get('/fail');
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ error: 'An account with that email already exists.' });
  });
  it('handles malformed JSON and validation errors without leaking request data', async () => {
    const app = express();
    app.use(express.json());
    app.post('/validate', asyncHandler(async (req, res) => res.json(z.object({ amount: z.number().positive() }).parse(req.body))));
    app.use(notFound);
    app.use(errorHandler);
    const invalidJson = await supertest(app).post('/validate').set('Content-Type', 'application/json').send('{"private":"secret"');
    expect(invalidJson.status).toBe(400);
    expect(invalidJson.body).toEqual({ error: 'Invalid JSON body.' });
    const invalid = await supertest(app).post('/validate').send({ amount: -1 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.fields.amount).toBeDefined();
    expect((await supertest(app).get('/missing')).status).toBe(404);
  });
  it('delegates an error after response headers instead of writing a second response', () => {
    const next = vi.fn();
    const error = new Error('failure');
    const json = vi.fn();
    errorHandler(error, { log: { error: vi.fn() } } as never, { headersSent: true, json } as never, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Request failed after headers were sent.' }));
    expect(json).not.toHaveBeenCalled();
  });
  it('serializes only allowlisted error metadata', () => {
    const result = safeError({ name: 'MongoServerError', code: 2, message: 'secret', stack: 'Error: private\n at call (C:\\app\\query.ts:12:3)', cause: 'mongodb://secret' });
    expect(result).toEqual({ type: 'MongoServerError', code: 2, frames: ['query.ts:12:3'] });
    expect(JSON.stringify(result)).not.toMatch(/secret|private|mongodb/);
  });
});
