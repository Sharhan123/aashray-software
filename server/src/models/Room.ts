import { Schema, model } from 'mongoose';

const bedSchema = new Schema({
  bedId: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true },
}, { _id: false });

const roomSchema = new Schema({
  // Optional for legacy records until an admin assigns them through the migration workflow.
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null, index: true },
  propertyName: { type: String, trim: true, default: '' },
  roomNumber: { type: String, required: true, trim: true },
  roomType: { type: String, enum: ['AC', 'NON_AC'], required: true, default: 'NON_AC' },
  capacity: { type: Number, required: true, min: 1, max: 30 },
  beds: { type: [bedSchema], default: [] },
  notes: { type: String, maxlength: 1000, default: '' },
  active: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false });

roomSchema.index({ propertyId: 1, roomNumber: 1 }, { unique: true, partialFilterExpression: { propertyId: { $type: 'objectId' } }, name: 'unique_room_number_per_property' });
export const Room = model('Room', roomSchema);
