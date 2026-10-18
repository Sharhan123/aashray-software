import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { env, isProduction } from '../config/env.js';
import { User } from '../models/User.js';
import { authenticate, revokeSession } from '../services/authService.js';

const credentialsSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200) });
const cookieOptions = { secure: env.COOKIE_SECURE === 'true' || isProduction, sameSite: env.COOKIE_SAME_SITE, path: '/' as const };
const publicUser = (user: { id?: string; _id?: { toString(): string }; name: string; email: string; role: string; permissions: readonly string[]; propertyIds?: readonly { toString(): string }[] }) => ({ id: user.id ?? user._id?.toString() ?? '', name: user.name, email: user.email, role: user.role, permissions: user.permissions, propertyIds: (user.propertyIds ?? []).map(String) });

export function csrf(_req: Request, res: Response) {
  const token = randomBytes(24).toString('base64url');
  res.cookie('aashray_csrf', token, { ...cookieOptions, httpOnly: false, maxAge: 12 * 60 * 60 * 1000 });
  return res.json({ csrfToken: token });
}

export async function login(req: Request, res: Response) {
  const data = credentialsSchema.parse(req.body);
  const auth = await authenticate(data.email, data.password);
  if (!auth) return res.status(401).json({ error: 'Email or password is incorrect.' });
  res.cookie('aashray_session', auth.rawToken, { ...cookieOptions, httpOnly: true, maxAge: auth.expiresAt.getTime() - Date.now() });
  return res.json({ user: publicUser(auth.user) });
}

export async function me(req: Request, res: Response) {
  const user = await User.findById(req.user?.id);
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  return res.json({ user: publicUser(user) });
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies?.aashray_session as string | undefined;
  if (token) await revokeSession(token);
  res.clearCookie('aashray_session', { ...cookieOptions, httpOnly: true });
  res.clearCookie('aashray_csrf', cookieOptions);
  return res.status(204).end();
}
