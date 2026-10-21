import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { env, isProduction } from '../config/env.js';
import { User } from '../models/User.js';
import { authenticate, revokeSession, rotateSession, REFRESH_TOKEN_TTL_MS } from '../services/authService.js';

const credentialsSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200) });
// Production frontend and API are commonly on separate sites (Vercel/Render), so
// cross-site credentialed fetches require SameSite=None and Secure cookies.
const cookieOptions = { secure: env.COOKIE_SECURE === 'true' || isProduction, sameSite: isProduction ? 'none' as const : env.COOKIE_SAME_SITE, path: '/' as const };
const accessCookie = 'aashray_session';
const refreshCookie = 'aashray_refresh';
const refreshCookieOptions = { ...cookieOptions, path: '/api/auth' as const };
const publicUser = (user: { id?: string; _id?: { toString(): string }; name: string; email: string; role: string; permissions: readonly string[]; propertyIds?: readonly { toString(): string }[] }) => ({ id: user.id ?? user._id?.toString() ?? '', name: user.name, email: user.email, role: user.role, permissions: user.permissions, propertyIds: (user.propertyIds ?? []).map(String) });

export function csrf(_req: Request, res: Response) {
  const token = randomBytes(24).toString('base64url');
  res.cookie('aashray_csrf', token, { ...cookieOptions, httpOnly: false, maxAge: REFRESH_TOKEN_TTL_MS });
  return res.json({ csrfToken: token });
}

export async function login(req: Request, res: Response) {
  const data = credentialsSchema.parse(req.body);
  const auth = await authenticate(data.email, data.password);
  if (!auth) return res.status(401).json({ error: 'Email or password is incorrect.' });
  const accessExpiresAt = auth.accessExpiresAt ?? auth.expiresAt;
  res.cookie(accessCookie, auth.rawToken, { ...cookieOptions, httpOnly: true, maxAge: accessExpiresAt.getTime() - Date.now() });
  if (auth.rawRefreshToken) res.cookie(refreshCookie, auth.rawRefreshToken, { ...refreshCookieOptions, httpOnly: true, maxAge: auth.refreshExpiresAt.getTime() - Date.now() });
  return res.json({ user: publicUser(auth.user) });
}

export async function refresh(req: Request, res: Response) {
  const rawRefreshToken = req.cookies?.[refreshCookie] as string | undefined;
  const auth = rawRefreshToken ? await rotateSession(rawRefreshToken) : null;
  if (!auth) {
    res.clearCookie(accessCookie, { ...cookieOptions, httpOnly: true });
    res.clearCookie(refreshCookie, { ...refreshCookieOptions, httpOnly: true });
    return res.status(401).json({ error: 'Authentication required.' });
  }
  res.cookie(accessCookie, auth.rawToken, { ...cookieOptions, httpOnly: true, maxAge: auth.accessExpiresAt.getTime() - Date.now() });
  res.cookie(refreshCookie, auth.rawRefreshToken, { ...refreshCookieOptions, httpOnly: true, maxAge: auth.refreshExpiresAt.getTime() - Date.now() });
  return res.json({ user: publicUser(auth.user) });
}

export async function me(req: Request, res: Response) {
  const user = await User.findById(req.user?.id);
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  return res.json({ user: publicUser(user) });
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[accessCookie] as string | undefined;
  const refreshToken = req.cookies?.[refreshCookie] as string | undefined;
  if (refreshToken) await revokeSession(token, refreshToken);
  else if (token) await revokeSession(token);
  res.clearCookie(accessCookie, { ...cookieOptions, httpOnly: true });
  res.clearCookie(refreshCookie, { ...refreshCookieOptions, httpOnly: true });
  res.clearCookie('aashray_csrf', cookieOptions);
  return res.status(204).end();
}
