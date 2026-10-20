import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { csrf, login, logout, me } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Try again later.' } });
router.get('/csrf', csrf);
router.post('/login', loginLimit, asyncHandler(login));
router.get('/me', requireAuth, asyncHandler(me));
router.post('/logout', requireCsrf, requireAuth, asyncHandler(logout));
export default router;
