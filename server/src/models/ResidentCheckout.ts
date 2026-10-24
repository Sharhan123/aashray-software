import { Schema, model } from 'mongoose';

const checkoutChargeSchema = new Schema({
  chargeId: { type: Schema.Types.ObjectId, ref: 'Charge', default: null },
  kind: { type: String, enum: ['RENT', 'UTILITY', 'OPENING_BALANCE', 'CHECKOUT_ADJUSTMENT'], required: true },
  description: { type: String, required: true },
  periodKey: { type: String, required: true },
  servicePeriodStart: { type: Date, default: null },
  servicePeriodEnd: { type: Date, default: null },
  amountPaise: { type: Number, required: true, min: 1 },
  appliedPaise: { type: Number, required: true, min: 0 },
  remainingPaise: { type: Number, required: true, min: 0 },
}, { _id: false });

const cancelledRentSchema = new Schema({
  chargeId: { type: Schema.Types.ObjectId, ref: 'Charge', required: true },
  description: { type: String, required: true },
  periodKey: { type: String, required: true },
  amountPaise: { type: Number, required: true, min: 1 },
}, { _id: false });

const residentCheckoutSchema = new Schema({
  residentId: { type: Schema.Types.ObjectId, ref: 'Resident', required: true, index: true },
  checkoutDate: { type: Date, required: true },
  checkedOutAt: { type: Date, required: true },
  reason: { type: String, required: true, maxlength: 500 },
  propertyName: { type: String, default: '' },
  roomNumber: { type: String, default: '' },
  bedId: { type: String, default: '' },
  outstandingBeforePaise: { type: Number, required: true, min: 0 },
  depositHeldPaise: { type: Number, required: true, min: 0 },
  appliedToChargesPaise: { type: Number, required: true, min: 0 },
  refundedPaise: { type: Number, required: true, min: 0 },
  additionalRefundedPaise: { type: Number, default: 0, min: 0 },
  depositRetainedPaise: { type: Number, required: true, min: 0 },
  outstandingAfterPaise: { type: Number, required: true, min: 0 },
  charges: { type: [checkoutChargeSchema], default: [] },
  finalBills: { type: [checkoutChargeSchema], default: [] },
  cancelledRentCharges: { type: [cancelledRentSchema], default: [] },
  idempotencyKey: { type: String, required: true, unique: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, versionKey: false });

residentCheckoutSchema.index({ residentId: 1, checkoutDate: -1 });
export const ResidentCheckout = model('ResidentCheckout', residentCheckoutSchema);
