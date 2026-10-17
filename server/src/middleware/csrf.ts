import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (SAFE.has(req.method) || req.path === '/login') return next();
  const cookie = req.cookies?.aashray_csrf as string | undefined;
  const header = req.get('x-csrf-token');
  const a = Buffer.from(cookie ?? ''); const b = Buffer.from(header ?? '');
  if (!cookie || !header || a.length !== b.length || !timingSafeEqual(a, b)) return res.status(403).json({ error: 'Request verification failed. Refresh and try again.' });
  return next();
}
