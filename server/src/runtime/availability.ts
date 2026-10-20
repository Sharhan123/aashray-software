import mongoose from 'mongoose';
import type { RequestHandler } from 'express';
import { logger } from '../config/logger.js';

export function createAvailability(databaseState: () => number, report: (ready: boolean) => void = () => undefined) {
  let initialized = false;
  let draining = false;
  const isReady = () => initialized && !draining && databaseState() === 1;
  let previous: boolean | undefined;
  const refresh = () => {
    const ready = isReady();
    if (previous !== ready) { previous = ready; report(ready); }
  };
  const guard: RequestHandler = (_req, res, next) => {
    if (isReady()) return next();
    res.setHeader('Retry-After', '5');
    if (draining) res.setHeader('Connection', 'close');
    return res.status(503).json({ error: 'Service temporarily unavailable. Please try again shortly.' });
  };
  const ready: RequestHandler = (_req, res) => res.status(isReady() ? 200 : 503).json({ status: isReady() ? 'ok' : 'unavailable' });
  return {
    isReady, guard, ready, refresh,
    markInitialized: () => { initialized = true; refresh(); },
    beginShutdown: () => { draining = true; refresh(); },
  };
}

export const availability = createAvailability(() => mongoose.connection.readyState, (ready) => {
  logger[ready ? 'info' : 'warn']({ event: ready ? 'readiness_restored' : 'readiness_unavailable', category: 'lifecycle' }, 'Readiness changed');
});
