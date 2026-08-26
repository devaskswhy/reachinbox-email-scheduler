import type { ListParams } from './api';

/**
 * Centralised so the compose dialog can invalidate exactly what it affects.
 * Keys are hierarchical: invalidating ['emails','scheduled'] refetches every
 * page of that list without naming each one.
 */
export const queryKeys = {
  scheduled: (params: ListParams = {}) =>
    ['emails', 'scheduled', params.page ?? 1, params.limit ?? 20] as const,
  scheduledAll: ['emails', 'scheduled'] as const,
  sent: (params: ListParams = {}) =>
    ['emails', 'sent', params.page ?? 1, params.limit ?? 20] as const,
  sentAll: ['emails', 'sent'] as const,
} as const;

/** How often the Scheduled tab re-polls. See README for why polling. */
export const SCHEDULED_REFETCH_MS = 15_000;
