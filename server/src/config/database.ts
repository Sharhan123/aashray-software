import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';
import { availability } from '../runtime/availability.js';

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);
  if (mongoose.connection.readyState === 1) return;
  if (mongoose.connection.readyState === 2) {
    await mongoose.connection.asPromise();
    return;
  }
  logger.info({ event: 'database_connecting', category: 'infrastructure' }, 'MongoDB connecting');
  // One shared driver pool. Retain the existing selection timeout and driver
  // pool defaults until metrics justify tuning. No application write retries.
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
    ...(process.env.VERCEL === '1' ? { maxPoolSize: 10, minPoolSize: 0 } : {}),
  });
}

mongoose.connection.on('connected', () => { logger.info({ event: 'database_connected', databaseState: 'connected', category: 'infrastructure' }, 'MongoDB connected'); availability.refresh(); });
mongoose.connection.on('reconnected', () => { logger.info({ event: 'database_reconnected', databaseState: 'reconnected', category: 'infrastructure' }, 'MongoDB reconnected'); availability.refresh(); });
mongoose.connection.on('disconnected', () => { logger.warn({ event: 'database_disconnected', category: 'infrastructure' }, 'MongoDB disconnected'); availability.refresh(); });
mongoose.connection.on('error', (error) => logger.error({ event: 'database_error', err: error, category: 'infrastructure' }, 'MongoDB connection error'));
