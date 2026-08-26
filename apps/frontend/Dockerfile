FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@11.23.0
WORKDIR /app

# ---------------------------------------------------------------------------
# deps
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared/package.json packages/shared/
# A slow link can exceed pnpm's default fetch timeout on a tree this size.
RUN pnpm config set fetch-timeout 600000 \
  && pnpm config set network-concurrency 8 \
  && pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/frontend apps/frontend

# NEXT_PUBLIC_* is inlined into the client bundle at build time, so the backend
# URL must be known here - it cannot be supplied at container start like the
# server-side variables can.
ENV DOCKER_BUILD=true
ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

# No NEXTAUTH_SECRET here on purpose: baking a secret-shaped value into an
# image layer trips Docker's SecretsUsedInArgOrEnv check, and the auth module
# only warns when it is absent. The real secret arrives at runtime.
RUN pnpm --filter @reachinbox/frontend build

# ---------------------------------------------------------------------------
# runtime - standalone output only, no pnpm workspace
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# `output: 'standalone'` traces exactly the modules the server needs and emits
# its own minimal node_modules, so none of the build tooling ships.
COPY --from=build /app/apps/frontend/.next/standalone ./
COPY --from=build /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build /app/apps/frontend/public ./apps/frontend/public

USER node
EXPOSE 3001

CMD ["node", "apps/frontend/server.js"]
