import { Router } from 'express';
import * as rateLimitModule from 'express-rate-limit';
import type { Options, RateLimitRequestHandler } from 'express-rate-limit';
import { csrf, login, logout, me, refresh } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { MongoRateLimitStore } from '../services/mongoRateLimitStore.js';

const router = Router();
const rateLimit = rateLimitModule.default as unknown as (options: Partial<Options>) => RateLimitRequestHandler;
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again later.' },
  ...(process.env.VERCEL === '1' ? { store: new MongoRateLimitStore() } : {}),
});
router.get('/csrf', csrf);
router.post('/login', loginLimit, asyncHandler(login));
router.post('/refresh', asyncHandler(refresh));
router.get('/me', requireAuth, asyncHandler(me));
router.post('/logout', requireCsrf, asyncHandler(logout));
export default router;
