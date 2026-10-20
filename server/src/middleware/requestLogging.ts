import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { logger } from '../config/logger.js';
import { safeError } from '../config/safeError.js';
import { processContext } from '../config/diagnostics.js';
import type { RequestHandler } from 'express';

const starts = new WeakMap<object, number>();
const routeLabel = (req: unknown) => {
  const request = req as Request;
  return typeof request.route?.path === 'string' ? `${request.baseUrl ?? ''}${request.route.path}` : 'unmatched';
};
export function requestContext(req: Request, statusCode: number) {
  return {
    ...processContext(), requestId: req.id, method: req.method,
    route: routeLabel(req), statusCode,
    durationMs: Math.max(0, Math.round((performance.now() - (starts.get(req) ?? performance.now())) * 1000) / 1000),
  };
}

export function requestLogging(log: Logger = logger): RequestHandler {
  // Only allowlisted metadata: URLs, headers, bodies and query strings can
  // contain credentials or resident information.
  const middleware = pinoHttp({
    logger: log,
    genReqId: (_req, res) => { const id = randomUUID(); res.setHeader('X-Request-ID', id); return id; },
    wrapSerializers: false,
    serializers: {
      req: (req) => ({ id: req.id, method: req.method }),
      res: (res) => ({ statusCode: res.statusCode }),
      err: safeError,
    },
    customSuccessObject: (req, res, value) => ({
      ...value, ...requestContext(req as Request, res.statusCode),
      event: res.statusCode >= 500 ? 'http_request_failed' : 'http_request_completed',
      category: 'http',
    }),
    customErrorObject: (req, res, _error, value) => ({ ...value, ...requestContext(req as Request, res.statusCode), event: 'http_request_failed' }),
    customSuccessMessage: () => 'Request completed',
    customErrorMessage: () => 'Request failed',
    autoLogging: { ignore: (req) => ['/api/health', '/health/live', '/health/ready'].includes(req.url ?? '') },
  });
  return (req, res, next) => {
    starts.set(req, performance.now());
    middleware(req, res, next);
  };
}
