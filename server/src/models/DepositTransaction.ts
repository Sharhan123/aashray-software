import { Schema, model } from 'mongoose';
const depositTransactionSchema = new Schema({
  residentId: { type: Schema.Types.ObjectId, ref: 'Resident', required: true, index: true },
  amountPaise: { type: Number, required: true, min: 1 },
  kind: { type: String, enum: ['RECEIVED', 'REFUNDED', 'ADJUSTED'], required: true },
  paymentMethod: { type: String, enum: ['CASH', 'BANK_TRANSFER', 'UPI', 'OTHER'], required: true },
  reference: { type: String, default: '' },
  reason: { type: String, default: '' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  idempotencyKey: { type: String, required: true, unique: true },
}, { timestamps: true, versionKey: false });
export const DepositTransaction = model('DepositTransaction', depositTransactionSchema);
