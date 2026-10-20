import { Schema, model } from 'mongoose';

const assignmentSnapshotSchema = new Schema({
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null },
  propertyName: { type: String, required: true, maxlength: 160 },
  roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  roomNumber: { type: String, required: true, maxlength: 40 },
  bedId: { type: String, required: true, maxlength: 20 },
}, { _id: false });

const residentTransferHistorySchema = new Schema({
  residentId: { type: Schema.Types.ObjectId, ref: 'Resident', required: true, index: true },
  from: { type: assignmentSnapshotSchema, required: true },
  to: { type: assignmentSnapshotSchema, required: true },
  transferType: { type: String, enum: ['BED_SWITCH', 'ROOM_SWITCH', 'PROPERTY_TRANSFER'], required: true },
  effectiveAt: { type: Date, required: true },
  recordedAt: { type: Date, required: true, default: Date.now },
  performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, trim: true, maxlength: 500, default: '' },
  transferReference: { type: String, required: true, unique: true, immutable: true },
}, { timestamps: true, versionKey: false });

residentTransferHistorySchema.index({ residentId: 1, recordedAt: -1 }, { name: 'resident_transfer_history_recent_first' });

export const ResidentTransferHistory = model('ResidentTransferHistory', residentTransferHistorySchema);
