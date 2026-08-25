import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// The Prisma CLI resolves .env relative to this package, but config lives in a
// single workspace-root .env. Walk up and load it before defineConfig runs so
// env("DATABASE_URL") in schema.prisma resolves.
function findWorkspaceRoot(start: string = process.cwd()): string {
  let dir = start;
  for (;;) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

loadDotenv({ path: resolve(findWorkspaceRoot(), '.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
