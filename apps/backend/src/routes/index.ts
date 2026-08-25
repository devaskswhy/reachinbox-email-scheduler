import { Router } from 'express';

import { campaignRouter } from './campaign.routes.js';
import { healthRouter } from './health.routes.js';

export const apiRouter: Router = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/campaigns', campaignRouter);
