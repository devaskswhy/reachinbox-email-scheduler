# One image, two entrypoints. The API and the worker run the same code from the
# same build; docker-compose.prod.yml picks which by overriding the command.
# Building once means the two processes can never drift apart in production.

# bookworm-slim rather than alpine: Prisma's query engine links against glibc,
# and the musl variants are a recurring source of "engine not found" failures.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@11.23.0
WORKDIR /app

# ---------------------------------------------------------------------------
# deps - cached on the manifests alone, so editing source does not reinstall
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared/package.json packages/shared/
# --ignore-scripts: the backend postinstall runs `prisma generate`, which needs
# a schema that has not been copied yet. Generation happens in the build stage.
RUN pnpm config set fetch-timeout 600000 \
  && pnpm config set network-concurrency 8 \
  && pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN pnpm --filter @reachinbox/backend exec prisma generate \
  && pnpm --filter @reachinbox/backend build

# ---------------------------------------------------------------------------
# runtime
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

# The whole workspace tree is carried over rather than a pruned copy: pnpm's
# node_modules is a symlink farm into .pnpm, and copying a subset breaks those
# links. Trading image size for a runtime that actually resolves its deps.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=build /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=build /app/apps/backend/prisma.config.ts ./apps/backend/prisma.config.ts

WORKDIR /app/apps/backend

# Drop privileges. node:22 ships an unprivileged `node` user already.
USER node

# Overridden to dist/worker.js for the worker service.
CMD ["node", "dist/server.js"]
