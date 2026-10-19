import { Schema, model } from 'mongoose';

const allocationSchema = new Schema({
  roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  roomNumber: { type: String, required: true },
  bedId: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, default: null },
  changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, default: '' },
}, { _id: false });

const scheduleSchema = new Schema({
  version: { type: Number, required: true },
  monthlyRentPaise: { type: Number, required: true, min: 0 },
  dueDay: { type: Number, required: true, min: 1, max: 31 },
  effectiveFrom: { type: Date, required: true },
  changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, default: 'Initial schedule' },
}, { _id: false });

const residentSchema = new Schema({
  residentId: { type: String, required: true, unique: true, index: true },
  admissionIdempotencyKey: { type: String, required: true, unique: true },
  fullName: { type: String, required: true, trim: true, maxlength: 140 },
  // Existing resident records stay unassigned until their property's gender is confirmed.
  gender: { type: String, enum: ['MALE', 'FEMALE'], default: null },
  mobile: { type: String, required: true, trim: true, maxlength: 24, index: true },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  governmentId: { type: String, trim: true, maxlength: 80, default: '' },
  emergencyContact: { type: String, trim: true, maxlength: 120, default: '' },
  admissionDate: { type: Date, required: true },
  billingStartDate: { type: Date, required: true },
  status: { type: String, enum: ['ACTIVE', 'NOTICE', 'INACTIVE'], default: 'ACTIVE', index: true },
  noticeStartDate: { type: Date, default: null },
  expectedDepartureDate: { type: Date, default: null },
  effectiveEndDate: { type: Date, default: null },
  checkoutIdempotencyKey: { type: String, default: null },
  securityDepositPaise: { type: Number, required: true, min: 0, default: 0 },
  notes: { type: String, maxlength: 3000, default: '' },
  allocations: { type: [allocationSchema], default: [] },
  rentSchedules: { type: [scheduleSchema], default: [] },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, versionKey: false });
residentSchema.index({ fullName: 1 });
residentSchema.index({ 'allocations.roomId': 1, 'allocations.bedId': 1, status: 1 });
export const Resident = model('Resident', residentSchema);
