import type { RequestHandler } from 'express';

// Express 4 does not forward rejected promises from async route handlers to
// error middleware. Wrap them so request failures become HTTP errors instead
// of unhandled rejections that can terminate the Node process.
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
