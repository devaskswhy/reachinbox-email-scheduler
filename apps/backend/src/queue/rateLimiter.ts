import type { Redis } from 'ioredis';

import { env } from '../config/env.js';

const SECONDS_PER_HOUR = 3600;

/**
 * UTC hour bucket, e.g. "2026-08-25T14". UTC deliberately: a local-time bucket
 * would double or skip a window at a daylight-saving boundary.
 */
export function hourBucket(at: Date = new Date()): string {
  return at.toISOString().slice(0, 13);
}

/** Start of the hour window after the one containing `at`. */
export function nextHourWindowStart(at: Date = new Date()): number {
  const next = new Date(at);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next.getTime();
}

export function rateLimitKey(senderId: string, at: Date = new Date()): string {
  // In global mode every sender shares one bucket, so the identity is dropped
  // from the key and all workers contend for the same counter.
  const scope = env.RATE_LIMIT_MODE === 'global' ? 'global' : senderId;
  return `ratelimit:${scope}:${hourBucket(at)}`;
}

export function hourlyLimitFor(campaignHourlyLimit: number | null): number {
  // A campaign-level override always wins; otherwise the mode picks which
  // global ceiling applies.
  if (campaignHourlyLimit !== null && campaignHourlyLimit > 0) {
    return campaignHourlyLimit;
  }
  return env.RATE_LIMIT_MODE === 'global'
    ? env.MAX_EMAILS_PER_HOUR
    : env.MAX_EMAILS_PER_HOUR_PER_SENDER;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Counter value this attempt observed. */
  count: number;
  limit: number;
  key: string;
}

/**
 * Reserves one slot in the current hour window.
 *
 * INCR is atomic, so concurrent workers cannot both read the same value and
 * each conclude there is room - whoever increments past the limit loses. The
 * EXPIRE is issued only when INCR returns exactly 1, i.e. by whichever worker
 * created the key: setting it on every call would slide the TTL forward
 * forever and the bucket would never reset.
 *
 * When the reservation is refused the counter is decremented again, because
 * this job did not actually consume a slot - without that, a burst of rejected
 * jobs would inflate the counter and suppress sends that should have been
 * allowed in the same window.
 */
export async function reserveSendSlot(
  redis: Redis,
  senderId: string,
  limit: number,
  at: Date = new Date(),
): Promise<RateLimitDecision> {
  const key = rateLimitKey(senderId, at);
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, SECONDS_PER_HOUR);
  }

  if (count > limit) {
    await redis.decr(key);
    return { allowed: false, count, limit, key };
  }

  return { allowed: true, count, limit, key };
}
