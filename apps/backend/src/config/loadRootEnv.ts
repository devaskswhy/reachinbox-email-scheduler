import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';

/**
 * pnpm runs each workspace package with its own directory as cwd, so a bare
 * dotenv call would look for apps/backend/.env. Config lives in a single root
 * .env, so walk up to the workspace root and load that instead.
 */
export function findWorkspaceRoot(start: string = process.cwd()): string {
  let dir = start;
  for (;;) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

/** Loads the workspace-root .env. Existing process env always wins. */
export function loadRootEnv(): void {
  loadDotenv({ path: resolve(findWorkspaceRoot(), '.env') });
}
