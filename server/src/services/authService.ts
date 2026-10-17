import { createHmac, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';

export const hashToken = (token: string) => createHmac('sha256', env.SESSION_SECRET).update(token).digest('hex');
const dummyPasswordHash = await argon2.hash(randomBytes(32), { type: argon2.argon2id });

export async function authenticate(email: string, password: string) {
  const user = await User.findOne({ email: email.toLowerCase(), active: true }).select('+passwordHash');
  const valid = await argon2.verify(user?.passwordHash ?? dummyPasswordHash, password).catch(() => false);
  if (!user || !valid) return null;
  user.lastLoginAt = new Date();
  await user.save();
  const rawToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12);
  await Session.create({ userId: user._id, tokenHash: hashToken(rawToken), expiresAt });
  return { user, rawToken, expiresAt };
}

export async function revokeSession(rawToken: string): Promise<void> {
  await Session.deleteOne({ tokenHash: hashToken(rawToken) });
}
