import mongoose from 'mongoose';
import { AppSettings } from '../models/AppSettings.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { Charge } from '../models/Charge.js';
import { DepositTransaction } from '../models/DepositTransaction.js';
import { MessageLog } from '../models/MessageLog.js';
import { Payment } from '../models/Payment.js';
import { Property } from '../models/Property.js';
import { Resident } from '../models/Resident.js';
import { ResidentMigration } from '../models/ResidentMigration.js';
import { ResidentTransferHistory } from '../models/ResidentTransferHistory.js';
import { Room } from '../models/Room.js';
import { RoomAllocation } from '../models/RoomAllocation.js';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { connectDatabase } from '../config/database.js';
import { initializeRateLimitIndexes } from '../services/mongoRateLimitStore.js';
import { availability } from './availability.js';

let initialization: Promise<void> | undefined;
let initializationSettled = false;

async function initialize() {
  if (mongoose.connection.readyState !== 1) await connectDatabase();
  await Promise.all([
    User.init(), Session.init(), Property.init(), Room.init(), Resident.init(),
    RoomAllocation.init(), ResidentTransferHistory.init(), Charge.init(), Payment.init(),
    DepositTransaction.init(), AuditEvent.init(), AppSettings.init(), MessageLog.init(), ResidentMigration.init(),
  ]);
  await initializeRateLimitIndexes();
  availability.markInitialized();
}

/** Share one MongoDB connection and index initialization across warm function requests. */
export function ensureServerlessDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1 && availability.isReady()) return Promise.resolve();
  if (mongoose.connection.readyState === 0 && initializationSettled) {
    initialization = undefined;
    initializationSettled = false;
  }
  if (!initialization) {
    const pending = initialize().then(() => {
      initializationSettled = true;
    }, (error: unknown) => {
      if (initialization === pending) initialization = undefined;
      initializationSettled = false;
      throw error;
    });
    initialization = pending;
  }
  return initialization;
}
