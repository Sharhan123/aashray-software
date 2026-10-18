import type { NextFunction, Request, Response } from 'express';
import { Session } from '../models/Session.js';
import { User, type Permission, type Role } from '../models/User.js';
import { hashToken } from '../services/authService.js';

declare global {
  // Express request augmentation uses this namespace as required by @types/express.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: { id: string; name: string; email: string; role: Role; permissions: Permission[]; propertyIds?: string[] } }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.aashray_session as string | undefined;
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
    if (!session) return res.status(401).json({ error: 'Authentication required.' });
    const user = await User.findOne({ _id: session.userId, active: true });
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions as Permission[], propertyIds: (user.propertyIds ?? []).map(String) };
    return next();
  } catch (error) { return next(error); }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have access to this action.' });
    return next();
  };
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || (req.user.role !== 'SUPER_ADMIN' && !req.user.permissions.includes(permission))) return res.status(403).json({ error: 'You do not have access to this action.' });
    return next();
  };
}
