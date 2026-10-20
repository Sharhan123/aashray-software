import { Agent, get, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpServer, drainServer, HTTP_TIMEOUTS, listen } from './httpServer.js';

const servers: Server[] = [];
const agents: Agent[] = [];
const start = async (handler: Parameters<typeof createHttpServer>[0]) => {
  const server = createHttpServer(handler);
  servers.push(server);
  await listen(server, 0);
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
};
function request(url: string, agent?: Agent) {
  return new Promise<{ body: string; reused: boolean }>((resolve, reject) => {
    const req = get(url, { agent: agent ?? false }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ body, reused: req.reusedSocket }));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}
afterEach(async () => {
  agents.splice(0).forEach((agent) => agent.destroy());
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});

describe('HTTP lifecycle', () => {
  it('binds IPv4 wildcard and serves successive requests over a keep-alive connection', async () => {
    const { server, url } = await start((_req, res) => res.end('ok'));
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    agents.push(agent);
    expect((server.address() as AddressInfo).address).toBe('0.0.0.0');
    expect(server.keepAliveTimeout).toBe(HTTP_TIMEOUTS.keepAliveTimeout);
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout);
    expect(server.requestTimeout).toBe(300_000);
    expect((await request(url, agent)).body).toBe('ok');
    expect(await request(url, agent)).toEqual({ body: 'ok', reused: true });
  });

  it('drains active requests before disconnecting and refuses new connections', async () => {
    let entered!: () => void;
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { entered = resolve; });
    const { server, url } = await start((_req, res) => {
      release = () => res.end('finished');
      entered();
    });
    const pending = request(url);
    await waiting;
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const drained = drainServer(server, disconnect);
    expect(server.listening).toBe(false);
    expect(disconnect).not.toHaveBeenCalled();
    release();
    expect((await pending).body).toBe('finished');
    expect(await drained).toBe(0);
    expect(disconnect).toHaveBeenCalledOnce();
    await expect(request(url)).rejects.toThrow();
  });

  it('bounds shutdown of a stuck request', async () => {
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => { entered = resolve; });
    const { server, url } = await start(() => entered());
    const pending = request(url).catch(() => ({ body: 'closed' }));
    await waiting;
    expect(await drainServer(server, async () => undefined, 30)).toBe(1);
    expect((await pending).body).toBe('closed');
  });

  it('reports a failed database disconnect', async () => {
    const { server } = await start((_req, res) => res.end());
    expect(await drainServer(server, async () => { throw new Error('disconnect failed'); })).toBe(1);
  });

  it('rejects a listener startup error instead of emitting an unhandled error', async () => {
    const { server } = await start((_req, res) => res.end());
    const other = createHttpServer((_req, res) => res.end());
    servers.push(other);
    await expect(listen(other, (server.address() as AddressInfo).port)).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});
