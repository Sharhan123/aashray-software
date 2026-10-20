import { EventEmitter } from 'node:events';
import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { installFatalHandlers } from './fatalErrors.js';

describe('fatal process failures', () => {
  it.each(['uncaughtException', 'unhandledRejection'])('exits nonzero on %s without printing secrets', (event) => {
    const runtime = Object.assign(new EventEmitter(), { exit: vi.fn() });
    const fatal = vi.fn();
    const flush = vi.fn((done: () => void) => done());
    const cleanup = installFatalHandlers({ fatal, flush } as unknown as Logger, runtime as unknown as NodeJS.Process);
    runtime.emit(event, new Error('mongodb://private-password@host'));
    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(fatal).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledOnce();
    expect(fatal.mock.calls[0]?.[0]).toMatchObject({ event: 'fatal_process_termination', processStartId: expect.any(String), uptimeSeconds: expect.any(Number) });
    expect(JSON.stringify(fatal.mock.calls)).not.toContain('private-password');
    cleanup();
    expect(runtime.listenerCount('uncaughtException')).toBe(0);
    expect(runtime.listenerCount('unhandledRejection')).toBe(0);
  });
  it('exits within the deadline if flushing stalls', () => {
    vi.useFakeTimers();
    try {
      const runtime = Object.assign(new EventEmitter(), { exit: vi.fn() });
      const cleanup = installFatalHandlers({ fatal: vi.fn(), flush: vi.fn() } as unknown as Logger, runtime as unknown as NodeJS.Process);
      runtime.emit('unhandledRejection', new Error('failure'));
      expect(runtime.exit).not.toHaveBeenCalled();
      vi.advanceTimersByTime(500);
      expect(runtime.exit).toHaveBeenCalledWith(1);
      cleanup();
    } finally { vi.useRealTimers(); }
  });
});
