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

async function start() {
  await connectDatabase();
  await Promise.all([User.init(), Session.init(), Property.init(), Room.init(), Resident.init(), RoomAllocation.init(), Charge.init(), Payment.init(), DepositTransaction.init(), AuditEvent.init(), AppSettings.init(), MessageLog.init(), ResidentMigration.init()]);
  const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'Aashray API listening'));
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => void mongoose.disconnect().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}
start().catch((error: unknown) => { logger.fatal({ err: error }, 'Server startup failed'); process.exit(1); });
