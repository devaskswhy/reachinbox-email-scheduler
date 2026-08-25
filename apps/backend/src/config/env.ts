import { z } from 'zod';

import { loadRootEnv } from './loadRootEnv.js';

loadRootEnv();

const intFromEnv = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

/**
 * Canonical spelling is 'per-sender'. The underscore form is accepted because
 * earlier .env files shipped with it, and silently falling back to the wrong
 * limiter would be worse than tolerating both spellings.
 */
const rateLimitMode = z
  .string()
  .default('per-sender')
  .transform((value) => value.trim().toLowerCase().replace(/_/g, '-'))
  .pipe(z.enum(['global', 'per-sender']));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PORT: intFromEnv(4001),
  WORKER_CONCURRENCY: intFromEnv(5),
  MIN_DELAY_MS_BETWEEN_SENDS: z.coerce.number().int().nonnegative().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: intFromEnv(200),
  /** Ceiling for the single shared bucket used when RATE_LIMIT_MODE=global. */
  MAX_EMAILS_PER_HOUR: intFromEnv(1000),
  RATE_LIMIT_MODE: rateLimitMode,
  SENDER_POOL_SIZE: intFromEnv(3),
});

export type Env = z.infer<typeof envSchema>;
export type RateLimitMode = Env['RATE_LIMIT_MODE'];

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail loudly at boot rather than surfacing undefined config deep in a job.
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
