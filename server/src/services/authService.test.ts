import { beforeEach, describe, expect, it, vi } from 'vitest';
import argon2 from 'argon2';

vi.mock('../models/User.js', () => ({ User: { findOne: vi.fn() } }));
vi.mock('../models/Session.js', () => ({ Session: { create: vi.fn() } }));

import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { authenticate, hashToken } from './authService.js';

const findOne = User.findOne as unknown as ReturnType<typeof vi.fn>;
const createSession = Session.create as unknown as ReturnType<typeof vi.fn>;

describe('authentication service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('verifies a real Argon2id password hash and stores only a token hash', async () => {
    const passwordHash = await argon2.hash('long-test-passphrase', { type: argon2.argon2id });
    const account = { _id: 'user-123', id: 'user-123', name: 'Owner', email: 'owner@example.com', role: 'SUPER_ADMIN', permissions: [], passwordHash, save: vi.fn() };
    findOne.mockReturnValue({ select: vi.fn().mockResolvedValue(account) });

    const result = await authenticate('OWNER@example.com', 'long-test-passphrase');

    expect(result?.user).toBe(account);
    expect(findOne).toHaveBeenCalledWith({ email: 'owner@example.com', active: true });
    expect(account.save).toHaveBeenCalledOnce();
    expect(result?.rawToken).toBeTruthy();
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-123', tokenHash: hashToken(result!.rawToken) }));
    expect(createSession.mock.calls[0]?.[0]).not.toHaveProperty('rawToken');
  });

  it('returns the same null result for an unknown user or a wrong password', async () => {
    findOne.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });
    await expect(authenticate('missing@example.com', 'wrong-passphrase')).resolves.toBeNull();
    const passwordHash = await argon2.hash('correct-passphrase', { type: argon2.argon2id });
    findOne.mockReturnValue({ select: vi.fn().mockResolvedValue({ passwordHash }) });
    await expect(authenticate('owner@example.com', 'wrong-passphrase')).resolves.toBeNull();
    expect(createSession).not.toHaveBeenCalled();
  });
});
