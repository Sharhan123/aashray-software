import { Schema, model } from 'mongoose';
const roomAllocationSchema = new Schema({
  residentId: { type: Schema.Types.ObjectId, ref: 'Resident', required: true, index: true },
  roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
  bedId: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, default: null },
  active: { type: Boolean, default: true },
  changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, default: '' },
}, { timestamps: true, versionKey: false });
roomAllocationSchema.index({ roomId: 1, bedId: 1 }, { unique: true, partialFilterExpression: { active: true }, name: 'one_active_resident_per_bed' });
export const RoomAllocation = model('RoomAllocation', roomAllocationSchema);
