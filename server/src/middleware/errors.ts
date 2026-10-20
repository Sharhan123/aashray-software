import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { isDatabaseError, isDatabaseUnavailable } from '../config/safeError.js';
import { requestContext } from './requestLogging.js';

export const notFound: RequestHandler = (_req, res) => { res.status(404).json({ error: 'Not found.' }); };
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  const requestLogger = req.log ?? logger;
  const category = isDatabaseError(error) ? 'infrastructure' : 'application';
  if (res.headersSent) {
    requestLogger.error({ ...requestContext(req, res.statusCode), event: 'application_error', err: error, category, responseHeadersSent: true }, 'Request failed after headers were sent');
    // Express's final handler may print the error itself. Forward a sanitized
    // error so it can close the response without exposing the original message.
    return next(new Error('Request failed after headers were sent.'));
  }
  if (isDatabaseUnavailable(error)) {
    requestLogger.error({ ...requestContext(req, 503), event: 'database_request_failed', err: error, category }, 'Database unavailable during request');
    res.setHeader('Retry-After', '5');
    return res.status(503).json({ error: 'Service temporarily unavailable. Please try again shortly.' });
  }
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  if (error instanceof ZodError) return res.status(400).json({ error: 'Please check the submitted information.', fields: error.flatten().fieldErrors });
  if (error?.code === 11000) return res.status(409).json({ error: 'An account with that email already exists.' });
  if (typeof error?.status === 'number' && error.status >= 400 && error.status < 600) {
    if (error.status >= 500) requestLogger.error({ ...requestContext(req, error.status), event: 'application_error', err: error, category }, 'Request failed');
    const databaseError = isDatabaseError(error);
    return res.status(error.status).json({ error: databaseError ? 'Request failed.' : error.message ?? 'Request failed.' });
  }
  requestLogger.error({ ...requestContext(req, 500), event: 'application_error', err: error, category }, 'Request failed');
  return res.status(500).json({ error: 'An unexpected error occurred.' });
};
