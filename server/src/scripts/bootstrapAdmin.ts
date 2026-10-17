import { env } from '../config/env.js';
import { connectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { User } from '../models/User.js';
import argon2 from 'argon2';
import mongoose from 'mongoose';
import { z } from 'zod';
import { assertBootstrapAllowed } from '../services/bootstrapGuard.js';

async function bootstrap() {
  assertBootstrapAllowed(env.ENABLE_ADMIN_BOOTSTRAP, false);
  const input = z.object({ name: z.string().trim().min(1).max(120), email: z.string().email(), password: z.string().min(14).max(200) }).parse({ name: env.INITIAL_ADMIN_NAME, email: env.INITIAL_ADMIN_EMAIL, password: env.INITIAL_ADMIN_PASSWORD });
  await connectDatabase();
  await User.init();
  assertBootstrapAllowed(env.ENABLE_ADMIN_BOOTSTRAP, Boolean(await User.exists({ role: 'SUPER_ADMIN' })));
  const existing = await User.findOne({ email: input.email.toLowerCase() });
  if (existing) throw new Error('The configured email already belongs to an account.');
  await User.create({ name: input.name, email: input.email, passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }), role: 'SUPER_ADMIN', active: true, permissions: [] });
  logger.info({ email: input.email.toLowerCase() }, 'Initial Super Admin created');
}

bootstrap().catch((error: unknown) => { logger.error({ err: error }, 'Admin bootstrap failed'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
