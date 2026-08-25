import { PrismaClient } from '@prisma/client';

/**
 * tsx watch reloads this module on every edit; without a global cache each
 * reload would open a fresh connection pool and exhaust MySQL's max_connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env['NODE_ENV'] === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}
