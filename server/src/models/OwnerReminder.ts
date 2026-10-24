import { Schema, model } from 'mongoose';

const ownerReminderSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  dueAt: { type: Date, required: true, index: true },
  repeatEveryHours: { type: Number, min: 1, max: 8760, default: null },
  active: { type: Boolean, default: true, index: true },
  completedAt: { type: Date, default: null },
  stoppedAt: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, versionKey: false });

ownerReminderSchema.index({ active: 1, dueAt: 1 });
export const OwnerReminder = model('OwnerReminder', ownerReminderSchema);
