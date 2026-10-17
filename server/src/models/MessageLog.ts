import { Schema, model } from 'mongoose';
const messageLogSchema = new Schema({
  residentId: { type: Schema.Types.ObjectId, ref: 'Resident', required: true, index: true },
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: String, required: true, maxlength: 30 },
  messageType: { type: String, enum: ['RENT_REMINDER', 'OVERDUE', 'UTILITY', 'CUSTOM'], required: true },
  message: { type: String, required: true, maxlength: 4000 },
  deliveryMechanism: { type: String, enum: ['WHATSAPP_CLICK_TO_CHAT'], required: true },
  status: { type: String, enum: ['PREPARED', 'OPENED_MANUALLY'], default: 'PREPARED' },
  openedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });
export const MessageLog = model('MessageLog', messageLogSchema);
