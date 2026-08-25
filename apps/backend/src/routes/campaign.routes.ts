import { Router } from 'express';

import { asyncHandler } from '../lib/asyncHandler.js';
import { resolveCreatedBy } from '../lib/currentUser.js';
import {
  listScheduledJobs,
  listSentJobs,
  scheduleCampaign,
} from '../services/campaign.service.js';
import { scheduleCampaignSchema } from '../validation/campaign.schema.js';
import { paginationSchema } from '../validation/pagination.schema.js';

export const campaignRouter: Router = Router();

/**
 * POST /api/campaigns/schedule
 * Persists a campaign and one PENDING EmailJob per recipient. Enqueueing onto
 * BullMQ happens in a later phase; this endpoint only writes to the database.
 */
campaignRouter.post(
  '/schedule',
  asyncHandler(async (req, res) => {
    const input = scheduleCampaignSchema.parse(req.body);
    const createdBy = resolveCreatedBy(req);

    const { campaign, jobCount, duplicatesRemoved } = await scheduleCampaign(
      input,
      createdBy,
    );

    res.status(201).json({ campaign, jobCount, duplicatesRemoved });
  }),
);

/** GET /api/campaigns/scheduled - work not yet delivered, newest first. */
campaignRouter.get(
  '/scheduled',
  asyncHandler(async (req, res) => {
    const pagination = paginationSchema.parse(req.query);
    res.json(await listScheduledJobs(pagination));
  }),
);

/** GET /api/campaigns/sent - finished attempts, successful or failed. */
campaignRouter.get(
  '/sent',
  asyncHandler(async (req, res) => {
    const pagination = paginationSchema.parse(req.query);
    res.json(await listSentJobs(pagination));
  }),
);
