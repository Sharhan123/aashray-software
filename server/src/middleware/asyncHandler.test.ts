import express from 'express';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { asyncHandler } from './asyncHandler.js';
import { errorHandler } from './errors.js';

describe('asyncHandler', () => {
  it('forwards rejected async requests to Express error handling and keeps the app responsive', async () => {
    const app = express();
    app.delete('/resident', asyncHandler(async () => {
      throw Object.assign(new Error('MongoDB transaction failed.'), { status: 503 });
    }));
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));
    app.use(errorHandler);

    const failed = await supertest(app).delete('/resident');
    const healthy = await supertest(app).get('/health');

    expect(failed.status).toBe(503);
    expect(failed.body.error).toBe('MongoDB transaction failed.');
    expect(healthy.status).toBe(200);
    expect(healthy.body.status).toBe('ok');
  });
});
