import { createServer, type RequestListener, type Server } from 'node:http';

export const HTTP_TIMEOUTS = {
  keepAliveTimeout: 120_000,
  headersTimeout: 125_000,
  requestTimeout: 300_000,
} as const;

export function createHttpServer(listener: RequestListener): Server {
  const server = createServer(listener);
  server.keepAliveTimeout = HTTP_TIMEOUTS.keepAliveTimeout;
  server.headersTimeout = HTTP_TIMEOUTS.headersTimeout;
  // Bounds receiving the request, not route execution or database queries.
  server.requestTimeout = HTTP_TIMEOUTS.requestTimeout;
  return server;
}

export function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '0.0.0.0');
  });
}

// Caller marks readiness false before invoking this. Close the listener first,
// drain active responses, then disconnect the shared database pool.
export function drainServer(server: Server, disconnect: () => Promise<unknown>, timeoutMs = 20_000, onForced: () => void = () => undefined): Promise<number> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      onForced();
      server.closeAllConnections();
      resolve(1);
    }, timeoutMs);
    server.close((error) => {
      void Promise.resolve().then(disconnect).then(
        () => { clearTimeout(timer); resolve(error ? 1 : 0); },
        () => { clearTimeout(timer); resolve(1); },
      );
    });
    server.closeIdleConnections();
  });
}
