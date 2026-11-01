import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import * as helmet from 'helmet';
import type { RequestHandler } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env, isProduction } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import propertyRoutes from './routes/propertyRoutes.js';
import financeRoutes from './routes/financeRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import propertyManagementRoutes from './routes/propertyManagementRoutes.js';
import dataDeletionRoutes from './routes/dataDeletionRoutes.js';
import quickSearchRoutes from './routes/quickSearchRoutes.js';
import { requireCsrf } from './middleware/csrf.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { availability } from './runtime/availability.js';
import { ensureServerlessDatabase } from './runtime/serverlessDatabase.js';
import { requestLogging } from './middleware/requestLogging.js';
import { User } from './models/User.js';
import { generateMonthlyBilling } from './services/billingService.js';
import { periodKeyFor } from './services/billingRules.js';
import { asyncHandler } from './middleware/asyncHandler.js';

export const app = express();
if (isProduction) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(requestLogging());
app.use((helmet.default as unknown as () => RequestHandler)());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'], exposedHeaders: ['X-Request-ID'] }));
if (process.env.VERCEL === '1') {
  app.use(['/api', '/health/ready'], (_req, _res, next) => {
    void ensureServerlessDatabase().then(() => next(), next);
  });
}
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
app.get('/health/ready', availability.ready);
app.use('/api', availability.guard);
app.get('/api/cron/monthly-rent', asyncHandler(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const authorization = req.get('authorization') ?? '';
  const expected = secret ? `Bearer ${secret}` : '';
  const providedBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(expected);
  if (!secret || secret.length < 16 || providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return res.status(secret ? 401 : 503).json({ error: secret ? 'Unauthorized.' : 'Monthly rent cron is not configured.' });
  }

  // Vercel cron schedules are UTC. The daily 19:00 UTC run lands between
  // 00:30 and 01:29 IST on Hobby (exactly 00:30 IST on plans with minute
  // precision). Reconciling today's business month daily makes a delayed or
  // missed first-of-month invocation self-heal without duplicate charges.
  const now = new Date();
  const periodKey = periodKeyFor(now);

  const admin = await User.findOne({ role: 'SUPER_ADMIN', active: true }).select('_id').lean();
  if (!admin) return res.status(503).json({ error: 'No active super admin is available for the billing audit.' });
  const result = await generateMonthlyBilling(periodKey, String(admin._id));
  return res.json({ ok: true, ...result });
}));
app.use('/api/auth', requireCsrf, authRoutes);
app.use('/api', requireCsrf, propertyRoutes);
app.use('/api', requireCsrf, propertyManagementRoutes);
app.use('/api', requireCsrf, dataDeletionRoutes);
app.use('/api', requireCsrf, financeRoutes);
app.use('/api', requireCsrf, workspaceRoutes);
app.use('/api', requireCsrf, quickSearchRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
