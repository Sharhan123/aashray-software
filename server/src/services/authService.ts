import { createHmac, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';

export const hashToken = (token: string) => createHmac('sha256', env.SESSION_SECRET).update(token).digest('hex');
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_MAX_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const dummyPasswordHash = await argon2.hash(randomBytes(32), { type: argon2.argon2id });

function newCredential() { return randomBytes(32).toString('base64url'); }
function sessionCredentials(now = Date.now(), absoluteExpiresAt = new Date(now + SESSION_MAX_TTL_MS)) {
  const accessExpiresAt = new Date(Math.min(now + ACCESS_TOKEN_TTL_MS, absoluteExpiresAt.getTime()));
  const refreshExpiresAt = new Date(Math.min(now + REFRESH_TOKEN_TTL_MS, absoluteExpiresAt.getTime()));
  return { rawToken: newCredential(), rawRefreshToken: newCredential(), accessExpiresAt, refreshExpiresAt, absoluteExpiresAt };
}

export async function authenticate(email: string, password: string) {
  const user = await User.findOne({ email: email.toLowerCase(), active: true }).select('+passwordHash');
  const valid = await argon2.verify(user?.passwordHash ?? dummyPasswordHash, password).catch(() => false);
  if (!user || !valid) return null;
  user.lastLoginAt = new Date();
  await user.save();
  const credentials = sessionCredentials();
  await Session.create({ userId: user._id, tokenHash: hashToken(credentials.rawToken), refreshTokenHash: hashToken(credentials.rawRefreshToken), accessExpiresAt: credentials.accessExpiresAt, refreshExpiresAt: credentials.refreshExpiresAt, absoluteExpiresAt: credentials.absoluteExpiresAt, expiresAt: credentials.absoluteExpiresAt });
  return { user, ...credentials, expiresAt: credentials.absoluteExpiresAt };
}

export async function rotateSession(rawRefreshToken: string) {
  const now = Date.now();
  const session = await Session.findOne({ refreshTokenHash: hashToken(rawRefreshToken), refreshExpiresAt: { $gt: new Date(now) }, expiresAt: { $gt: new Date(now) } });
  if (!session) return null;
  const user = await User.findOne({ _id: session.userId, active: true });
  if (!user) { await Session.deleteOne({ _id: session._id }); return null; }
  const absoluteExpiresAt = session.absoluteExpiresAt ?? session.expiresAt;
  if (absoluteExpiresAt.getTime() <= now) { await Session.deleteOne({ _id: session._id }); return null; }
  const credentials = sessionCredentials(now, absoluteExpiresAt);
  const rotated = await Session.findOneAndUpdate(
    { _id: session._id, refreshTokenHash: hashToken(rawRefreshToken), refreshExpiresAt: { $gt: new Date(now) } },
    { $set: { tokenHash: hashToken(credentials.rawToken), refreshTokenHash: hashToken(credentials.rawRefreshToken), accessExpiresAt: credentials.accessExpiresAt, refreshExpiresAt: credentials.refreshExpiresAt } },
    { new: true },
  );
  return rotated ? { user, ...credentials, expiresAt: credentials.absoluteExpiresAt } : null;
}

export async function revokeSession(rawToken?: string, rawRefreshToken?: string): Promise<void> {
  const tokenHashes = [rawToken, rawRefreshToken].filter((token): token is string => Boolean(token)).map(hashToken);
  if (tokenHashes.length) await Session.deleteOne({ $or: [{ tokenHash: { $in: tokenHashes } }, { refreshTokenHash: { $in: tokenHashes } }] });
}
