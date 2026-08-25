import type { Request } from 'express';
import { z } from 'zod';

/**
 * Campaign.createdBy records the signed-in user's email, but NextAuth is not
 * wired up yet. Until it is, the frontend forwards the session email in an
 * x-user-email header and this falls back to a dev identity.
 *
 * TODO: replace with the verified session subject once auth lands. This header
 * is caller-controlled and must not be trusted for authorisation.
 */
const DEV_FALLBACK_EMAIL = 'dev@reachinbox.local';

const emailHeader = z.string().trim().toLowerCase().email();

export function resolveCreatedBy(req: Request): string {
  const header = req.get('x-user-email');
  const parsed = emailHeader.safeParse(header);
  if (parsed.success) return parsed.data;

  return process.env['DEV_USER_EMAIL'] ?? DEV_FALLBACK_EMAIL;
}
