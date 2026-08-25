import { defineConfig } from 'tsup';

// Two entrypoints, two processes: the API never runs queue consumers and the
// worker never binds a port. Bundling pulls @reachinbox/shared into each
// output, so dist/ has no workspace-relative imports left to resolve.
export default defineConfig({
  entry: ['src/server.ts', 'src/worker.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  noExternal: ['@reachinbox/shared'],
});
