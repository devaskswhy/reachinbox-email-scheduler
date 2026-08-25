import { z } from 'zod';

/**
 * Clock skew between the browser that picked the time and this server means a
 * "now" request can arrive a few seconds stale. Allow a small grace window
 * rather than rejecting a schedule the user reasonably considers immediate.
 */
export const START_TIME_PAST_TOLERANCE_MS = 5 * 60 * 1000;

/** Guards against an unbounded payload fanning out into millions of rows. */
export const MAX_RECIPIENTS_PER_CAMPAIGN = 5_000;

const recipientEmail = z
  .string()
  .trim()
  .min(1, 'Recipient address cannot be empty')
  .email('Not a valid email address')
  .transform((value) => value.toLowerCase());

export const scheduleCampaignSchema = z
  .object({
    subject: z.string().trim().min(1, 'Subject is required').max(500),

    body: z.string().min(1, 'Body is required'),

    recipients: z
      .array(recipientEmail)
      .min(1, 'At least one recipient is required')
      .max(
        MAX_RECIPIENTS_PER_CAMPAIGN,
        `A campaign cannot exceed ${MAX_RECIPIENTS_PER_CAMPAIGN} recipients`,
      ),

    startTime: z
      .string()
      .datetime({ offset: true, message: 'startTime must be an ISO-8601 timestamp' })
      .refine(
        (value) => Date.now() - new Date(value).getTime() <= START_TIME_PAST_TOLERANCE_MS,
        {
          message: `startTime cannot be more than ${
            START_TIME_PAST_TOLERANCE_MS / 60_000
          } minutes in the past`,
        },
      ),

    delayMs: z
      .number({ invalid_type_error: 'delayMs must be a number' })
      .int('delayMs must be a whole number of milliseconds')
      .nonnegative('delayMs cannot be negative')
      .max(24 * 60 * 60 * 1000, 'delayMs cannot exceed 24 hours'),

    hourlyLimit: z
      .number({ invalid_type_error: 'hourlyLimit must be a number' })
      .int('hourlyLimit must be a whole number')
      .positive('hourlyLimit must be greater than zero')
      .optional(),
  })
  .strict();

export type ScheduleCampaignInput = z.infer<typeof scheduleCampaignSchema>;
