import { Schema, model } from 'mongoose';

const allocationSchema = new Schema({ chargeId: { type: Schema.Types.ObjectId, ref: 'Charge', required: true }, amountPaise: { type: Number, required: true, min: 1 } }, { _id: false });
const paymentSchema = new Schema({
  residentId: { type: Schema.Types.ObjectId, ref: 'Resident', required: true, index: true },
  amountPaise: { type: Number, required: true, min: 1 },
  paymentDate: { type: Date, required: true },
  method: { type: String, enum: ['CASH', 'BANK_TRANSFER', 'UPI', 'OTHER'], required: true },
  reference: { type: String, trim: true, maxlength: 120, default: '' },
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
  allocations: { type: [allocationSchema], default: [] },
  idempotencyKey: { type: String, required: true, unique: true },
  receivedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reversedAt: { type: Date, default: null },
  reversalReason: { type: String, default: '' },
  reversedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, versionKey: false });
paymentSchema.index({ paymentDate: -1 });
export const Payment = model('Payment', paymentSchema);
