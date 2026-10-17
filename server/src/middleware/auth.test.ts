import { describe, expect, it, vi } from 'vitest';
import { requirePermission, requireRole } from './auth.js';
import type { Request, Response, NextFunction } from 'express';

function check(middleware: ReturnType<typeof requireRole> | ReturnType<typeof requirePermission>, user: Express.Request['user']) {
  const req = { user } as Request;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
  const next = vi.fn() as NextFunction;
  middleware(req, res, next);
  return { res, next };
}

describe('authorization middleware', () => {
  it('permits a Super Admin through a permission gate', () => {
    const { next } = check(requirePermission('settings:write'), { id: '1', name: 'Owner', email: 'owner@example.com', role: 'SUPER_ADMIN', permissions: [] });
    expect(next).toHaveBeenCalledOnce();
  });
  it('denies staff unless that precise permission was assigned', () => {
    const { res, next } = check(requirePermission('settings:write'), { id: '2', name: 'Staff', email: 'staff@example.com', role: 'STAFF', permissions: ['dashboard:read'] });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it('does not allow staff through a Super Admin role gate', () => {
    const { res } = check(requireRole('SUPER_ADMIN'), { id: '2', name: 'Staff', email: 'staff@example.com', role: 'STAFF', permissions: [] });
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
