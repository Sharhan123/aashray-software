import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  MONGODB_URI: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('strict'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  ENABLE_ADMIN_BOOTSTRAP: z.enum(['true', 'false']).default('false'),
  INITIAL_ADMIN_NAME: z.string().default(''),
  INITIAL_ADMIN_EMAIL: z.string().default(''),
  INITIAL_ADMIN_PASSWORD: z.string().default(''),
});

export const env = schema.parse(process.env);
export const isProduction = env.NODE_ENV === 'production';
