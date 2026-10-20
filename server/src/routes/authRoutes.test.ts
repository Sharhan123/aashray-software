import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import supertest, { type Agent } from 'supertest';
import type { RequestHandler } from 'express';

vi.mock('../runtime/availability.js', () => ({
  availability: {
    guard: ((_req, _res, next) => next()) as RequestHandler,
    ready: ((_req, res) => res.json({ status: 'ok' })) as RequestHandler,
  },
}));

vi.mock('../services/authService.js', () => ({ authenticate: vi.fn(), revokeSession: vi.fn(), hashToken: vi.fn((token: string) => token) }));
vi.mock('../models/Session.js', () => ({ Session: { findOne: vi.fn() } }));
vi.mock('../models/User.js', () => ({ User: { findOne: vi.fn(), findById: vi.fn() }, STAFF_PERMISSIONS: ['dashboard:read', 'residents:read', 'residents:write', 'rooms:read', 'rooms:write', 'billing:read', 'billing:write', 'payments:read', 'payments:write', 'utilities:read', 'utilities:write', 'messages:read', 'messages:send', 'reports:read', 'staff:read', 'staff:write', 'settings:read', 'settings:write'] }));

describe('authentication REST endpoints', () => {
  let client: Agent;
  let authenticate: typeof import('../services/authService.js').authenticate;
  let revokeSession: typeof import('../services/authService.js').revokeSession;
  let sessionFindOne: ReturnType<typeof vi.fn>;
  let userFindOne: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/aashray_test_only';
    process.env.SESSION_SECRET = 'test-only-secret-with-more-than-32-bytes';
    process.env.CLIENT_ORIGIN = 'http://localhost:5173';
    const [{ app }, authService, { Session }, { User }] = await Promise.all([
      import('../app.js'), import('../services/authService.js'), import('../models/Session.js'), import('../models/User.js'),
    ]);
    client = supertest.agent(app);
    authenticate = authService.authenticate;
    revokeSession = authService.revokeSession;
    sessionFindOne = vi.mocked(Session.findOne);
    userFindOne = vi.mocked(User.findOne);
  });

  beforeEach(() => vi.clearAllMocks());

  it('uses one generic error for unsuccessful login attempts', async () => {
    vi.mocked(authenticate).mockResolvedValue(null);
    const response = await client.post('/api/auth/login').send({ email: 'unknown@example.com', password: 'wrong' });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Email or password is incorrect.');
  });

  it('creates a cookie-backed session after valid credentials', async () => {
    vi.mocked(authenticate).mockResolvedValue({
      user: { id: 'user-1', name: 'Aashray Owner', email: 'owner@example.com', role: 'SUPER_ADMIN', permissions: [] } as never,
      rawToken: 'opaque-session-token', expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const response = await client.post('/api/auth/login').send({ email: 'owner@example.com', password: 'private-passphrase' });
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('owner@example.com');
    const cookies = String(response.headers['set-cookie'] ?? '');
    expect(cookies).toContain('aashray_session=opaque-session-token');
    expect(cookies).toContain('HttpOnly');
  });

  it('rejects protected session reads without a valid session', async () => {
    const response = await supertest((await import('../app.js')).app).get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  it('forwards invalid login input without terminating the API', async () => {
    const response = await client.post('/api/auth/login').send({ email: 'invalid', password: '' });
    expect(response.status).toBe(400);
    expect(response.body.fields.email).toBeDefined();
    expect((await client.get('/api/health')).body).toEqual({ status: 'ok' });
  });

  it('forwards an authentication database rejection and returns a request ID', async () => {
    vi.mocked(authenticate).mockRejectedValueOnce(Object.assign(new Error('private connection details'), { name: 'MongoNetworkError' }));
    const response = await client.post('/api/auth/login').send({ email: 'owner@example.com', password: 'test-password' });
    expect(response.status).toBe(503);
    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.body.error).not.toContain('private');
    expect((await client.get('/api/health')).status).toBe(200);
  });

  it('forwards database failures from authentication middleware', async () => {
    sessionFindOne.mockRejectedValueOnce(Object.assign(new Error('query failed'), { name: 'MongoServerError', code: 2 }));
    const response = await client.get('/api/auth/me').set('Cookie', 'aashray_session=test');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'An unexpected error occurred.' });
  });

  it('validates a CSRF token, revokes the session, and clears cookies on logout', async () => {
    sessionFindOne.mockResolvedValue({ userId: 'user-1' } as never);
    userFindOne.mockResolvedValue({ id: 'user-1', name: 'Owner', email: 'owner@example.com', role: 'SUPER_ADMIN', permissions: [], active: true } as never);
    const csrf = await client.get('/api/auth/csrf');
    const response = await client.post('/api/auth/logout').set('X-CSRF-Token', csrf.body.csrfToken);
    expect(response.status).toBe(204);
    expect(revokeSession).toHaveBeenCalledWith('opaque-session-token');
  });
});
