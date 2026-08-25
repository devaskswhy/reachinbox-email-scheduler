import { Router } from 'express';

import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';

export const healthRouter: Router = Router();

/**
 * GET /api/health
 * Reports 503 when the database is unreachable so a load balancer pulls this
 * instance rather than routing requests that are certain to fail.
 */
healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    let database: 'up' | 'down' = 'up';

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'api',
      uptime: process.uptime(),
      checks: { database },
      timestamp: new Date().toISOString(),
    });
  }),
);
