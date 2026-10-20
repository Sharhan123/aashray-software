import { app } from './app.js';
import { connectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import mongoose from 'mongoose';
import { User } from './models/User.js';
import { Session } from './models/Session.js';
import { Room } from './models/Room.js';
import { Resident } from './models/Resident.js';
import { RoomAllocation } from './models/RoomAllocation.js';
import { Charge } from './models/Charge.js';
import { Payment } from './models/Payment.js';
import { DepositTransaction } from './models/DepositTransaction.js';
import { AuditEvent } from './models/AuditEvent.js';
import { AppSettings } from './models/AppSettings.js';
import { MessageLog } from './models/MessageLog.js';
import { ResidentMigration } from './models/ResidentMigration.js';
import { Property } from './models/Property.js';
import { ResidentTransferHistory } from './models/ResidentTransferHistory.js';
import { availability } from './runtime/availability.js';
import { createHttpServer, drainServer, HTTP_TIMEOUTS, listen } from './runtime/httpServer.js';
import { installFatalHandlers } from './runtime/fatalErrors.js';

installFatalHandlers(logger);
const server = createHttpServer(app);
let shuttingDown = false;
async function shutdown(signal: string, failed = false) {
  if (shuttingDown) return;
  shuttingDown = true;
  availability.beginShutdown();
  logger.info({ event: 'shutdown_started', signal, category: 'lifecycle' }, 'Shutting down');
  const exitCode = await drainServer(server, () => mongoose.disconnect(), 20_000, () => {
    logger.fatal({ event: 'shutdown_forced', category: 'lifecycle' }, 'Shutdown deadline exceeded');
  });
  if (exitCode) logger.error({ event: 'shutdown_failed', category: 'infrastructure' }, 'Shutdown did not complete cleanly');
  else logger.info({ event: 'shutdown_completed', category: 'lifecycle' }, 'Graceful shutdown completed');
  process.exit(failed ? 1 : exitCode);
}
async function start() {
  const startedAt = performance.now();
  logger.info({ event: 'server_startup', category: 'lifecycle', nodeVersion: process.version }, 'Server starting');
  availability.refresh();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
    logger.info({ event: 'shutdown_signal_received', category: 'lifecycle', signal }, 'Shutdown signal received');
    void shutdown(signal);
  });
  await listen(server, env.PORT);
  server.on('error', (error) => {
    logger.fatal({ event: 'http_server_failure', err: error, category: 'infrastructure' }, 'HTTP server failure');
    void shutdown('HTTP_ERROR', true);
  });
  logger.info({ event: 'http_listening', port: env.PORT, host: '0.0.0.0', nodeVersion: process.version, ...HTTP_TIMEOUTS }, 'Aashray API listening; initializing dependencies');
  await connectDatabase();
  logger.info({ event: 'database_startup_completed', elapsedMs: Math.round(performance.now() - startedAt) }, 'Database startup completed');
  await Promise.all([User.init(), Session.init(), Property.init(), Room.init(), Resident.init(), RoomAllocation.init(), ResidentTransferHistory.init(), Charge.init(), Payment.init(), DepositTransaction.init(), AuditEvent.init(), AppSettings.init(), MessageLog.init(), ResidentMigration.init()]);
  availability.markInitialized();
  if (!shuttingDown) logger.info({ event: 'server_ready', elapsedMs: Math.round(performance.now() - startedAt) }, 'Aashray API ready');
}
start().catch((error: unknown) => {
  logger.fatal({ event: 'server_startup_failed', err: error, category: 'infrastructure' }, 'Server startup failed');
  void shutdown('STARTUP_ERROR', true);
});
