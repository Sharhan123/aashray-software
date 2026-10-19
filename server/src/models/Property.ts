import { Schema, model } from 'mongoose';

const propertySchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  // Null is retained for pre-gender properties until the owner maps them.
  gender: { type: String, enum: ['MALE', 'FEMALE'], default: null },
  address: { type: String, trim: true, maxlength: 500, default: '' },
  contactPhone: { type: String, trim: true, maxlength: 30, default: '' },
  contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  active: { type: Boolean, default: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, versionKey: false });

propertySchema.index({ name: 1 });
export const Property = model('Property', propertySchema);
