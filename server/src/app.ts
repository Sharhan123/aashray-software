import express from 'express';
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
import { requireCsrf } from './middleware/csrf.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { availability } from './runtime/availability.js';
import { ensureServerlessDatabase } from './runtime/serverlessDatabase.js';
import { requestLogging } from './middleware/requestLogging.js';

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
app.use('/api/auth', requireCsrf, authRoutes);
app.use('/api', requireCsrf, propertyRoutes);
app.use('/api', requireCsrf, propertyManagementRoutes);
app.use('/api', requireCsrf, dataDeletionRoutes);
app.use('/api', requireCsrf, financeRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
