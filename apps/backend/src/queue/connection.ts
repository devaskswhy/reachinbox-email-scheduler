import IORedis, { type Redis } from 'ioredis';

import { env } from '../config/env.js';

/**
 * BullMQ requires maxRetriesPerRequest: null. Workers issue blocking commands
 * (BRPOPLPUSH) that legitimately sit open for long stretches; ioredis's default
 * retry cap would treat those as failures and tear the connection down.
 */
export function createRedisConnection(): Redis {
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  connection.on('error', (error: Error) => {
    console.error('[redis] connection error:', error.message);
  });

  return connection;
}
