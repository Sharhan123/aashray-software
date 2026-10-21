import { Schema, model } from 'mongoose';

const sessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Only keyed hashes are persisted; the raw opaque credentials exist in HttpOnly cookies only.
  tokenHash: { type: String, required: true, unique: true },
  accessExpiresAt: { type: Date, default: null, index: true },
  refreshTokenHash: { type: String, default: null, unique: true, sparse: true },
  refreshExpiresAt: { type: Date, default: null, index: true },
  absoluteExpiresAt: { type: Date, default: null },
  // The TTL field is the absolute session cap, not the short access-token expiry.
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true, versionKey: false });

export const Session = model('Session', sessionSchema);
