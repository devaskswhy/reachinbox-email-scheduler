import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

// Next only reads .env from this package's directory, but the workspace keeps
// a single root .env. Walk up and load it so NEXTAUTH_SECRET, the Google
// credentials and NEXT_PUBLIC_BACKEND_URL resolve without a duplicate file.
function findWorkspaceRoot(start) {
  let dir = start;
  for (;;) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

loadDotenv({
  path: resolve(findWorkspaceRoot(dirname(fileURLToPath(import.meta.url))), '.env'),
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @reachinbox/shared ships TypeScript source, so Next compiles it inline.
  transpilePackages: ['@reachinbox/shared'],
};

export default nextConfig;
