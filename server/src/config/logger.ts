import pino from 'pino';
import { env } from './env.js';
import { safeError } from './safeError.js';
import { processContext } from './diagnostics.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { pid: process.pid },
  mixin: processContext,
  serializers: { err: safeError },
  redact: ['req.headers.cookie', 'req.headers.authorization', 'password', 'passwordHash', 'SESSION_SECRET'],
});
