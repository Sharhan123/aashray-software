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
  rentReminderTemplate: { type: String, default: 'Dear {residentName}, 😊\n\nThis is a gentle reminder that rent of {amount} for the period {periodStart} to {periodEnd} is due on {dueDate}. Kindly clear your dues at the earliest.\n\n📌 Important Notes:\n• Rent must be paid within 5 days of the due date. Late charges of ₹50 per day apply from {lateFeeStart}.\n• 30 days’ prior notice is mandatory before vacating.\n\nPlease ignore this message if you have already paid.\n\nThank you for your cooperation! 🙏\n– Aashray Paying Guest', maxlength: 1000 },
  whatsappPhoneNumberId: { type: String, default: '' },
  whatsappBusinessAccountId: { type: String, default: '' },
  whatsappEnabled: { type: Boolean, default: false },
  whatsappAutoRemindersEnabled: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });
export const AppSettings = model('AppSettings', appSettingsSchema);
