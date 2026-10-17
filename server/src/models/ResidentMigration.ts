import { Schema, model } from 'mongoose';

const residentMigrationSchema = new Schema({
  residentId: { type: Schema.Types.ObjectId, ref: 'Resident', required: true, unique: true },
  goLiveDate: { type: Date, required: true },
  periodKey: { type: String, required: true },
  monthlyRentPaise: { type: Number, required: true, min: 0 },
  dueDay: { type: Number, required: true, min: 1, max: 31 },
  openingArrearsPaise: { type: Number, required: true, min: 0 },
  prepaidRentPaise: { type: Number, required: true, min: 0 },
  currentPeriodSettledPaise: { type: Number, required: true, min: 0 },
  creditRemainingPaise: { type: Number, required: true, min: 0 },
  securityDepositHeldPaise: { type: Number, required: true, min: 0 },
  source: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, versionKey: false });
export const ResidentMigration = model('ResidentMigration', residentMigrationSchema);
