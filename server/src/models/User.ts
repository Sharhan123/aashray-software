import { Schema, model, type InferSchemaType } from 'mongoose';

export const STAFF_PERMISSIONS = [
  'dashboard:read', 'residents:read', 'residents:write', 'rooms:read', 'rooms:write',
  'billing:read', 'billing:write', 'payments:read', 'payments:write', 'utilities:read', 'utilities:write',
  'messages:read', 'messages:send', 'reports:read', 'staff:read', 'staff:write',
  'settings:read', 'settings:write',
] as const;
export type Permission = (typeof STAFF_PERMISSIONS)[number];
export type Role = 'SUPER_ADMIN' | 'STAFF';

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['SUPER_ADMIN', 'STAFF'], required: true },
  active: { type: Boolean, default: true, index: true },
  permissions: { type: [String], enum: STAFF_PERMISSIONS, default: [] },
  propertyIds: { type: [Schema.Types.ObjectId], ref: 'Property', default: [] },
  lastLoginAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });
userSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: 'SUPER_ADMIN' }, name: 'single_super_admin' });

export type UserRecord = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
