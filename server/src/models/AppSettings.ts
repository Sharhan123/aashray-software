import { Schema, model } from 'mongoose';
const appSettingsSchema = new Schema({
  key: { type: String, required: true, unique: true, default: 'main' },
  businessName: { type: String, default: 'Aashray Hospitality', maxlength: 160 },
  contactPhone: { type: String, default: '', maxlength: 30 },
  contactEmail: { type: String, default: '', maxlength: 254 },
  currency: { type: String, default: 'INR', enum: ['INR'] },
  timezone: { type: String, default: 'Asia/Kolkata' },
  firstMonthProration: { type: String, enum: ['FULL_MONTH'], default: 'FULL_MONTH' },
  reminderOffsets: { type: [Number], default: [3, 0, -3] },
  paymentMethods: { type: [String], default: ['CASH', 'BANK_TRANSFER', 'UPI', 'OTHER'] },
  utilityTypes: { type: [String], default: ['ELECTRICITY', 'AC', 'OTHER'] },
  whatsappPhoneNumberId: { type: String, default: '' },
  whatsappBusinessAccountId: { type: String, default: '' },
  whatsappEnabled: { type: Boolean, default: false },
  whatsappAutoRemindersEnabled: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });
export const AppSettings = model('AppSettings', appSettingsSchema);
