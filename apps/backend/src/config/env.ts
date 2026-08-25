import { z } from 'zod';

import { loadRootEnv } from './loadRootEnv.js';

loadRootEnv();

const intFromEnv = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  PORT: intFromEnv(4001),
  WORKER_CONCURRENCY: intFromEnv(5),
  MIN_DELAY_MS_BETWEEN_SENDS: z.coerce.number().int().nonnegative().default(1000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: intFromEnv(100),
  RATE_LIMIT_MODE: z.enum(['global', 'per_sender']).default('per_sender'),
  SENDER_POOL_SIZE: intFromEnv(3),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail loudly at boot rather than surfacing undefined config deep in a job.
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
