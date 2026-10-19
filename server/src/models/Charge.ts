import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const chargeSchema = new Schema({
  residentId: { type: Schema.Types.ObjectId, ref: 'Resident', required: true, index: true },
  kind: { type: String, enum: ['RENT', 'UTILITY', 'OPENING_BALANCE'], required: true },
  utilityType: { type: String, default: '' },
  periodKey: { type: String, required: true },
  servicePeriodStart: { type: Date, default: null },
  servicePeriodEnd: { type: Date, default: null },
  description: { type: String, required: true, trim: true, maxlength: 240 },
  amountPaise: { type: Number, required: true, min: 1 },
  paidPaise: { type: Number, default: 0, min: 0 },
  externalPaidPaise: { type: Number, default: 0, min: 0 },
  issuedAt: { type: Date, required: true },
  dueAt: { type: Date, required: true },
  status: { type: String, enum: ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE'], default: 'PENDING', index: true },
  scheduleVersion: { type: Number, default: null },
  idempotencyKey: { type: String, required: true, unique: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  audit: [{ at: { type: Date, required: true }, by: { type: Schema.Types.ObjectId, ref: 'User', required: true }, action: { type: String, required: true }, reason: { type: String, required: true }, beforePaise: Number, afterPaise: Number }],
}, { timestamps: true, versionKey: false });
chargeSchema.index({ residentId: 1, kind: 1, periodKey: 1 }, { unique: true, partialFilterExpression: { kind: 'RENT' } });
chargeSchema.index({ dueAt: 1, status: 1 });
export const Charge = model('Charge', chargeSchema);
export type ChargeDocument = HydratedDocument<InferSchemaType<typeof chargeSchema>>;
