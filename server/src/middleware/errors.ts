import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';

export const notFound: RequestHandler = (_req, res) => { res.status(404).json({ error: 'Not found.' }); };
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  void _next;
  if (error instanceof ZodError) return res.status(400).json({ error: 'Please check the submitted information.', fields: error.flatten().fieldErrors });
  if (typeof error?.status === 'number' && error.status >= 400 && error.status < 600) return res.status(error.status).json({ error: error.message ?? 'Request failed.' });
  if (error?.code === 11000) return res.status(409).json({ error: 'An account with that email already exists.' });
  logger.error({ err: error }, 'Request failed');
  return res.status(500).json({ error: 'An unexpected error occurred.' });
};
