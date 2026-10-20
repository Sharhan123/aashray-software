import { describe, expect, it, vi } from 'vitest';

vi.mock('mongoose', async () => {
  const { EventEmitter } = await import('node:events');
  return { default: { set: vi.fn(), connect: vi.fn().mockResolvedValue(undefined), connection: new EventEmitter() } };
});
vi.mock('./logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import mongoose from 'mongoose';
import { logger } from './logger.js';
import { connectDatabase } from './database.js';

describe('shared database connection diagnostics', () => {
  it('retains the selection timeout and leaves driver pool defaults unchanged', async () => {
    await connectDatabase();
    expect(mongoose.connect).toHaveBeenCalledOnce();
    expect(mongoose.connect).toHaveBeenCalledWith(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  });
  it('observes disconnect/reconnect without reconnect loops or retrying operations', () => {
    const calls = vi.mocked(mongoose.connect).mock.calls.length;
    mongoose.connection.emit('connected');
    mongoose.connection.emit('disconnected');
    mongoose.connection.emit('reconnected');
    mongoose.connection.emit('error', Object.assign(new Error('private connection string'), { name: 'MongoNetworkError' }));
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ event: 'database_connected', databaseState: 'connected' }), 'MongoDB connected');
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'database_disconnected' }), 'MongoDB disconnected');
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ event: 'database_reconnected', databaseState: 'reconnected' }), 'MongoDB reconnected');
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ category: 'infrastructure' }), 'MongoDB connection error');
    expect(vi.mocked(mongoose.connect).mock.calls.length).toBe(calls);
  });
});
