# ReachInbox Scheduler

A production-grade email scheduling service and dashboard. Upload a lead list,
schedule a campaign, and have it delivered at a controlled rate across a pool of
sender accounts — **surviving process and container restarts without dropping or
duplicating a single email**.

Built for the ReachInbox full-stack assignment.

|                |                                                                                |
| -------------- | ------------------------------------------------------------------------------ |
| **Live demo**  | See [Deployment](#deployment) — hosted via Cloudflare Tunnel                   |
| **Stack**      | TypeScript · Express · BullMQ · Redis · MySQL · Prisma · Next.js 14 · Tailwind |
| **Scheduling** | BullMQ delayed jobs — **no cron, anywhere**                                    |

---

## For reviewers — start here

**Five commands to a working system.** Assumes Docker, Node 18.17+ and pnpm.

```bash
pnpm install
cp .env.example .env                                  # then add Google OAuth creds
pnpm docker:up                                        # MySQL + Redis
pnpm --filter @reachinbox/backend db:migrate          # schema
pnpm --filter @reachinbox/backend db:seed             # mints 3 Ethereal inboxes
pnpm dev                                              # API + worker + frontend
```

Open <http://localhost:3001>, sign in, and upload `sample-leads.csv` from the
repository root.

**Want to check the two hard requirements without reading any code?**

| Claim                 | Command                                           | What it proves                                                               |
| --------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Handles 1000+ at once | `pnpm --filter @reachinbox/backend simulate:load` | 1000 scheduled, 0 dropped, and the hour-bucket spread the rate limit implies |
| Survives restart      | `pnpm --filter @reachinbox/backend test:restart`  | asserts no duplicate rows, jobs still queued, nothing sent early             |

Both print pass/fail. Neither sends real email.

**Where the interesting code lives**

| Requirement                 | File                                                 |
| --------------------------- | ---------------------------------------------------- |
| No cron — delayed jobs      | `apps/backend/src/queue/enqueue.ts`                  |
| Restart safety              | `apps/backend/src/queue/reconcile.ts`                |
| Rate limiting + concurrency | `apps/backend/src/queue/worker.ts`, `rateLimiter.ts` |
| Scheduling transaction      | `apps/backend/src/services/campaign.service.ts`      |

Each carries a comment block explaining _why_, not just what.

## Contents

1. [For reviewers — start here](#for-reviewers--start-here)
2. [Overview](#overview)
3. [Quick start](#quick-start)
4. [Ethereal email](#ethereal-email)
5. [Environment variables](#environment-variables)
6. [Architecture](#architecture)
7. [Verification scripts](#verification-scripts)
8. [Features implemented](#features-implemented)
9. [Deployment](#deployment)
10. [Assumptions and trade-offs](#assumptions-and-trade-offs)

---

## Overview

You upload a `.csv` or `.txt` lead list, write a subject and body, pick a start
time and a delay between sends, and the system takes it from there. Each
recipient becomes one row in MySQL and one delayed job in Redis. A separate
worker process drains the queue, spacing sends apart, respecting a per-sender
hourly ceiling, and recording where every message ended up.

**There is no cron anywhere.** No `crontab`, no `node-cron`, no `setInterval`
polling loop. Scheduling is done entirely by BullMQ delayed jobs, and a
reconciler that runs **once at boot** closes the one gap delayed jobs cannot
cover on their own.

### Repository layout

```
apps/
  backend/
    prisma/            schema, migrations, Ethereal seed
    scripts/           simulate-load.ts, test-restart-survival.ts
    src/
      config/          env parsing and validation
      lib/             prisma client, errors, async handler
      mail/            transporter cache + send
      queue/           queue, enqueue, reconciler, worker, rate limiter
      routes/          Express routes
      services/        campaign scheduling transaction
      validation/      Zod schemas
      server.ts        API entrypoint
      worker.ts        worker entrypoint (separate process)
  frontend/
    src/app/           App Router pages (login, dashboard/scheduled, dashboard/sent)
    src/components/    DataTable, compose dialog, reusable primitives
    src/lib/           API client, CSV parsing, formatting
packages/
  shared/              types shared by both apps
```

---

## Quick start

### Prerequisites

- **Node.js 18.17+**
- **pnpm 9+** — `npm install -g pnpm`
- **Docker Desktop** — for MySQL and Redis

### 1. Install

```bash
git clone https://github.com/devaskswhy/reachinbox-email-scheduler.git
cd reachinbox-email-scheduler
pnpm install
cp .env.example .env
```

There is **one `.env` at the repository root**, not one per package. Both apps
walk up to find it, so there is no second copy to keep in sync.

### 2. Start MySQL and Redis

```bash
pnpm docker:up
```

| Service | Host port | Notes                                |
| ------- | --------- | ------------------------------------ |
| Redis 7 | `6380`    | `--appendonly yes` on a named volume |
| MySQL 8 | `3307`    | named volume, `reachinbox` database  |

Non-default host ports avoid colliding with a local MySQL or Redis you may
already run. Both use **named volumes**, so data survives `docker compose down`
(use `down -v` to wipe). Wait for both to report healthy:

```bash
docker compose ps
```

### 3. Create the schema and mint Ethereal senders

```bash
pnpm --filter @reachinbox/backend db:migrate
pnpm --filter @reachinbox/backend db:seed
```

### 4. Google OAuth

1. [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
2. **Create credentials → OAuth client ID → Web application**
3. **Authorised JavaScript origins:** `http://localhost:3001`
4. **Authorised redirect URIs:** `http://localhost:3001/api/auth/callback/google`
5. Copy the client ID and secret into `.env`
6. Generate a session secret: `openssl rand -base64 32` → `NEXTAUTH_SECRET`

While the consent screen is unpublished, add every sign-in address under
**Test users** or Google will block them.

> `NEXTAUTH_URL` **must** match the address the frontend actually serves on. A
> mismatch makes Google reject the callback.

### Sample lead list

`sample-leads.csv` at the repository root is a ready-made upload for trying the
compose flow. It deliberately contains a header row, a row with no address, and
one address repeated in different case, so the parser reports
**18 valid � 2 skipped � 1 duplicate** rather than a uniform count.

### 5. Run everything

```bash
pnpm dev
```

| Process  | Address                      |
| -------- | ---------------------------- |
| API      | <http://localhost:4001>      |
| Worker   | no port — consumes the queue |
| Frontend | <http://localhost:3001>      |

Or run them in three separate terminals — which is what you want when
demonstrating a restart:

```bash
pnpm --filter @reachinbox/backend dev        # API, watch mode
pnpm --filter @reachinbox/backend worker     # worker
pnpm --filter @reachinbox/frontend dev       # frontend
```

**The worker is a genuinely separate process.** It never binds a port, and the
API never consumes the queue. Either can be killed and restarted independently.

### Production build

```bash
pnpm build
pnpm --filter @reachinbox/backend start          # node dist/server.js
pnpm --filter @reachinbox/backend start:worker   # node dist/worker.js
pnpm --filter @reachinbox/frontend start
```

### All scripts

| Command                                             | Does                                    |
| --------------------------------------------------- | --------------------------------------- |
| `pnpm dev`                                          | API + worker + frontend together        |
| `pnpm build` · `pnpm typecheck` · `pnpm lint`       | workspace-wide                          |
| `pnpm docker:up` · `pnpm docker:down`               | MySQL + Redis                           |
| `db:migrate` · `db:seed` · `db:studio` · `db:reset` | Prisma, backend package                 |
| `simulate:load`                                     | 1000-job load simulation, sends nothing |
| `test:restart`                                      | restart-survival test                   |

---

## Ethereal email

[Ethereal](https://ethereal.email) is a fake SMTP service: it accepts mail and
shows it in a webmail inbox but never delivers to the real world, which makes it
safe to run thousands of simulated sends.

### Creating senders

```bash
pnpm --filter @reachinbox/backend db:seed
```

The seed reads `SENDER_POOL_SIZE` and, **for each pool slot that does not
already exist**, calls Nodemailer's `createTestAccount()` to mint a real Ethereal
inbox, storing its host, port, user and password on the `Sender` row. It prints
each account's credentials — save them.

**The seed is idempotent.** Re-running never mints a new account for a slot that
already has one and never overwrites stored credentials, because those inboxes
hold prior test sends worth keeping. A second run reports `0 created, N reused`.

> **Gotcha worth knowing.** `nodemailer.createTestAccount()` caches its result
> in-process and returns the _same_ account for every call in one process — five
> calls a second apart still yield one inbox. The seed sets
> `ETHEREAL_CACHE=false` before importing nodemailer (via dynamic import, since
> ESM hoists static ones) so each pool slot gets a distinct inbox.

### Reading sent mail

- **From the dashboard** — click any row on **Sent**. It opens that message's
  Ethereal preview URL, stored on `EmailJob.providerMessageId`.
- **From webmail** — sign in at <https://ethereal.email/login> with any sender's
  credentials from the seed output.

### Simulating failures

`SIMULATE_SMTP_FAILURE_RATE` throws **before** any network call, so an injected
failure never leaves a real message delivered and then retried:

```bash
SIMULATE_SMTP_FAILURE_RATE=0.5 pnpm --filter @reachinbox/backend worker
```

---

## Environment variables

All read from the single root `.env`. See `.env.example`.

| Variable                         | Default                 | Used by  | Description                                                                                                 |
| -------------------------------- | ----------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                   | —                       | backend  | MySQL connection string. **Required.**                                                                      |
| `REDIS_URL`                      | —                       | backend  | Redis connection, BullMQ's backing store. **Required.**                                                     |
| `PORT`                           | `4001`                  | API      | Port the Express API listens on.                                                                            |
| `WORKER_CONCURRENCY`             | `5`                     | worker   | Jobs one worker handles in parallel.                                                                        |
| `MIN_DELAY_MS_BETWEEN_SENDS`     | `2000`                  | worker   | Minimum spacing between sends, enforced **queue-wide**, not per process.                                    |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `200`                   | worker   | Hourly ceiling per sender when `RATE_LIMIT_MODE=per-sender`.                                                |
| `MAX_EMAILS_PER_HOUR`            | `1000`                  | worker   | Ceiling for the shared bucket when `RATE_LIMIT_MODE=global`.                                                |
| `RATE_LIMIT_MODE`                | `per-sender`            | worker   | `per-sender` or `global`.                                                                                   |
| `SENDER_POOL_SIZE`               | `3`                     | seed     | Ethereal accounts the seed maintains.                                                                       |
| `SIMULATE_SMTP_FAILURE_RATE`     | `0`                     | worker   | Probability (0–1) a send throws before touching SMTP.                                                       |
| `RUN_WORKER_IN_API`              | `false`                 | API      | Runs the worker inside the API process, for hosts that only offer web services.                             |
| `NEXTAUTH_URL`                   | `http://localhost:3001` | frontend | Canonical frontend URL. **Must match** the OAuth redirect origin.                                           |
| `NEXTAUTH_SECRET`                | —                       | frontend | Signs session JWTs. `openssl rand -base64 32`.                                                              |
| `GOOGLE_CLIENT_ID`               | —                       | frontend | Google OAuth client id.                                                                                     |
| `GOOGLE_CLIENT_SECRET`           | —                       | frontend | Google OAuth client secret.                                                                                 |
| `NEXT_PUBLIC_BACKEND_URL`        | `http://localhost:4001` | frontend | Backend base URL. **Inlined at build time** — changing it needs a rebuild, and it must never hold a secret. |

A campaign's own `hourlyLimit`, set in the compose form, overrides whichever
global ceiling applies.

---

## Architecture

### How scheduling works

`POST /api/campaigns/schedule` does two things, **in this order**:

1. **Inside one Prisma transaction** — create the `Campaign`, then one
   `EmailJob` per recipient with `status = PENDING`, a `senderId` assigned
   **round-robin** across the pool, and
   `scheduledFor = startTime + (index × delayMs)`.
2. **After the transaction commits** — enqueue each row onto BullMQ and advance
   it to `QUEUED`.

The ordering matters. Enqueuing _inside_ the transaction risks the worker
picking up a job whose row is not yet committed. Committing first means the
worst case is a row with no job — which the reconciler repairs.

Each job is added with `delay = scheduledFor − now`, so **Redis itself holds the
schedule**. Nothing polls the database asking "is anything due yet?".

Round-robin matters for throughput: consecutive recipients land on different
senders, so a per-sender hourly ceiling binds much later than if one identity
sent everything.

The job payload carries **only `{ emailJobId }`** — never the recipient, subject
or body. The worker re-reads the row at send time, so a job that sat delayed for
hours cannot deliver a stale copy of an edited campaign, and Redis memory stays
flat regardless of body size.

### How persistence on restart is handled

There are exactly two ways a scheduled email could be lost. Each has a specific
countermeasure, documented in `src/queue/reconcile.ts` and `src/queue/enqueue.ts`.

**1 — The process or container restarts after the job was queued.**
Covered by **Redis AOF persistence** (`--appendonly yes` on a named volume). A
delayed job is ordinary Redis state, replayed from the append-only file on
restart, firing at its original time. Without AOF every waiting job would
evaporate when the container recycled.

**2 — The process died between the database commit and the Redis add.**
Redis persistence cannot help; the job never reached Redis. The row sits in MySQL
as `PENDING` with nothing scheduled to act on it. This is the window the
**reconciler** closes.

`reconcilePendingJobs()` selects every row in `PENDING`, `QUEUED` or
`RESCHEDULED` and re-enqueues it. It runs **once at boot in both the API and the
worker**, before either accepts work — whichever comes up first performs the
repair.

A blanket re-enqueue is safe rather than a duplicate-send hazard because of
**`jobId` dedupe**: the BullMQ job id _is_ the database row id. BullMQ treats job
ids as unique per queue, so `add` for an existing id silently returns the
existing job. Rows that survived in Redis are skipped; only genuinely missing
ones are added. The reconciler is therefore a **no-op on a clean restart and a
repair pass on a dirty one**, without needing to know which happened.

> A completed job is eventually evicted by `removeOnComplete`, freeing its id.
> That does not reopen a duplicate-send hole, because the reconciler only selects
> `PENDING`/`QUEUED`/`RESCHEDULED`. A delivered row is `SENT` and is never handed
> back. **The database status is the source of truth for "has this been sent";
> Redis is only the scheduling mechanism.**

Running it once at boot is sufficient precisely because it is _not_ a poller —
steady-state scheduling is BullMQ's job.

### How rate limiting and concurrency are implemented

Four mechanisms, each solving a different problem.

**Worker concurrency — `WORKER_CONCURRENCY`.** Sends are I/O-bound, so
overlapping them is nearly free.

**Atomic claim — what makes concurrency safe.** The processor's first act is one
conditional update:

```sql
UPDATE email_jobs SET status = 'SENDING'
WHERE id = ? AND status IN ('PENDING','QUEUED','RESCHEDULED')
```

Zero rows affected means someone else already claimed it, and the processor
returns without touching SMTP. MySQL serialises the row write, so exactly one
caller wins. This also guards BullMQ's **stalled-job recovery**: if a worker
loses its lock, BullMQ hands the job to a second worker — without this claim,
both would send.

**Minimum delay — `MIN_DELAY_MS_BETWEEN_SENDS`.** BullMQ's
`limiter: { max: 1, duration: N }` is a **queue-wide token bucket in Redis**, not
a per-process sleep. It means "at most one send _begins_ every N ms,
system-wide", so it keeps holding when a second worker starts, and it throttles
job _starts_ — leaving concurrency free to overlap the SMTP round trips.

**Hourly ceiling — Redis hour-bucket counters.** Before sending:

```
key   = ratelimit:{senderId}:{YYYY-MM-DDTHH}   # UTC
count = INCR key
if count == 1: EXPIRE key 3600
```

`INCR` is atomic, so concurrent workers cannot both conclude there is room.
`EXPIRE` fires **only when `INCR` returns exactly 1** — setting it every call
would slide the TTL forward forever and the bucket would never reset. Buckets are
UTC, since local time would double or skip a window at a DST boundary.

**Over the limit — requeue, never fail.** The worker:

1. **Decrements the counter back** — this job consumed no slot. Without this, a
   burst of rejected jobs would inflate the counter and suppress sends that
   should have been allowed in the same window.
2. Sets the row to `RESCHEDULED` with an explanatory `lastError`.
3. Computes the next hour window plus a small stagger from the job's original
   position, and calls `job.moveToDelayed(runAt, token)`.

The job is **deferred, never failed and never dropped** — no attempt consumed.

**Retries.** `attempts: 3` with exponential backoff from 5s (5s → 10s → 20s). A
thrown SMTP error increments `attempts`, records `lastError` and rethrows.
**Only the final attempt sets `FAILED`**; earlier ones return the row to `QUEUED`
so it still reads as outstanding work — and so the reconciler recovers it if the
process dies before BullMQ retries.

### Dashboard refresh strategy

**Scheduled polls every 15 seconds** (TanStack Query `refetchInterval`) rather
than offering a manual refresh button. Those rows change state on their own as
the worker drains the queue, with no user action to hang a refresh off, and a
manual button would leave a stale table looking authoritative.
`refetchIntervalInBackground` is off, so a hidden tab stops polling.

**Sent does not poll** — `SENT` and `FAILED` are terminal. Scheduling a campaign
invalidates the scheduled list directly, so new rows appear immediately.

---

## Verification scripts

### Behaviour under load

```bash
pnpm --filter @reachinbox/backend simulate:load
pnpm --filter @reachinbox/backend simulate:load -- --recipients 5000
```

Schedules 1000 recipients through the **real** scheduling service, then runs the
reconciler. **Nothing is sent** — the worker never starts, so no SMTP connection
opens and no Ethereal quota is used.

Measured (1000 recipients, 3 senders, limit 200/hour):

```
Integrity
  requested          : 1000
  rows in database   : 1000
  jobs found in Redis: 1000
  dropped            : 0
  RESULT             : OK

  sender 0   334 jobs   09:00 → 200   10:00 → 134
  sender 1   333 jobs   09:00 → 200   10:00 → 133
  sender 2   333 jobs   09:00 → 200   10:00 → 133
```

Scheduling 1000 rows took **689 ms**; the reconciler scanned all 1000 in
**1138 ms** and added nothing — every job was already in Redis, proving the
`jobId` dedupe holds at volume.

### Restart survival

```bash
# terminal 1
pnpm --filter @reachinbox/backend worker
# terminal 2
pnpm --filter @reachinbox/backend test:restart
```

Schedules five emails two minutes out, prints their state, then asks you to kill
and restart the worker. In a TTY it waits for Enter and verifies automatically;
otherwise run `test:restart -- --verify` yourself.

Measured — worker killed mid-flight and restarted:

```
restart-0  SENT  scheduled 08:43:12.098  sent 08:43:15.439
restart-1  SENT  scheduled 08:43:17.098  sent 08:43:20.152
restart-2  SENT  scheduled 08:43:22.098  sent 08:43:25.627
restart-3  SENT  scheduled 08:43:27.098  sent 08:43:28.183
restart-4  SENT  scheduled 08:43:32.098  sent 08:43:33.179

no duplicate rows             : PASS (5 rows for 5 recipients)
outstanding jobs still queued : PASS
nothing sent before its time  : PASS (5 sent, 0 early)
RESULT: PASS
```

All five survived the kill in Redis, the restarted worker's reconciler added
nothing, and every send happened _after_ its scheduled time.

---

## Features implemented

### Backend

**Scheduler**

- [x] `POST /api/campaigns/schedule`, Zod-validated — rejects empty recipients,
      malformed addresses, and a `startTime` more than 5 minutes in the past
- [x] Campaign + one `EmailJob` per recipient in a single transaction
- [x] `scheduledFor = startTime + (index × delayMs)` — recipients spread out
- [x] Senders assigned round-robin across the pool
- [x] BullMQ delayed jobs — **no cron, no `node-cron`, no `setInterval`**
- [x] `GET /api/campaigns/scheduled` — paginated, joined with campaign + sender
- [x] `GET /api/campaigns/sent` — paginated, terminal states
- [x] `GET /api/health` — 503 when the database is unreachable
- [x] Central error handler, consistent `{ error, details? }` shape

**Persistence / restart safety**

- [x] Redis AOF on a named volume — delayed jobs survive a container restart
- [x] Idempotent enqueue — BullMQ `jobId` _is_ the `EmailJob` id
- [x] `reconcilePendingJobs()` at boot in **both** API and worker
- [x] MySQL data on a named volume
- [x] Verified by `test-restart-survival.ts`

**Rate limiting**

- [x] Minimum delay — queue-wide BullMQ limiter, not per process
- [x] Per-sender hourly ceiling via atomic Redis `INCR` on UTC hour buckets
- [x] `EXPIRE` only on bucket creation, so the window actually resets
- [x] Counter decremented on refusal, so rejected jobs do not inflate it
- [x] `global` and `per-sender` modes; per-campaign `hourlyLimit` override
- [x] Over-limit jobs `moveToDelayed` into the next window — never dropped
- [x] All limits configurable via env, nothing hardcoded

**Concurrency**

- [x] Configurable worker concurrency
- [x] Atomic claim prevents double-sends
- [x] Guards BullMQ stalled-job recovery, not just parallel workers
- [x] Worker is a separate process, restartable independently of the API
- [x] Retries with exponential backoff; `FAILED` only once attempts are spent
- [x] Graceful shutdown drains in-flight jobs and closes pooled SMTP sockets
- [x] Verified by `simulate-load.ts` — 1000 jobs, 0 dropped

### Frontend

**Login**

- [x] Real Google OAuth via NextAuth, JWT session strategy
- [x] Middleware redirects unauthenticated users from `/dashboard/*` to `/login`,
      preserving the destination as `callbackUrl`
- [x] Middleware redirects authenticated users away from `/login`
- [x] Readable error message when OAuth is misconfigured

**Dashboard**

- [x] Header with app name, avatar, user name, email and logout
- [x] Scheduled / Sent as real routes — linkable and back-button friendly
- [x] Primary **Compose New Email** button
- [x] Design tokens in `tailwind.config.ts`: one accent, one easing curve
- [x] `prefers-reduced-motion` respected

**Compose**

- [x] Subject and body fields
- [x] Drag-and-drop plus click-to-browse upload, `.csv` and `.txt`
- [x] Client-side parsing — papaparse for CSV, line split for TXT
- [x] Live "N valid email addresses detected", plus skipped and duplicate counts
- [x] Case-insensitive de-duplication
- [x] Start time, delay between emails, optional hourly limit
- [x] Schedule disabled until subject, body and ≥1 recipient are present
- [x] Loading state, success toast, error toast carrying the backend's message

**Tables**

- [x] One generic `DataTable` used by both tabs
- [x] TanStack Query with a root `QueryClientProvider`
- [x] Scheduled polls every 15s; Sent does not (terminal states)
- [x] Status badges — distinct per status, green/red reserved for terminal
- [x] Times formatted in the **viewer's** timezone via `Intl`
- [x] Skeleton rows while loading, not a spinner
- [x] Empty states with a Compose action
- [x] Inline error banner with Retry instead of a blank table
- [x] Clicking a sent row opens its Ethereal preview

**Code quality**

- [x] Reusable primitives — `Modal`, `FormField`, `FileDropzone`, `DataTable`
- [x] Shared types in `packages/shared`, used by both apps
- [x] Strict TypeScript across the workspace, ESLint and Prettier clean

---

## Deployment

### Live demo

Hosted via **Cloudflare Tunnel** from a local machine. See
[Assumptions and trade-offs](#assumptions-and-trade-offs) for why.

```bash
cloudflared tunnel --url http://localhost:3001   # frontend
cloudflared tunnel --url http://localhost:4001   # API
```

Set `NEXTAUTH_URL` and `NEXT_PUBLIC_BACKEND_URL` to the generated URLs, rebuild
the frontend (`NEXT_PUBLIC_*` is inlined at build time), and add the frontend URL
to the Google OAuth client's origins and redirect URIs.

### Real deployment — single host

`docker-compose.prod.yml` runs the whole stack — MySQL, Redis, API, worker,
frontend, and Caddy for automatic TLS:

```bash
cp .env.production.example .env.production   # fill in DOMAIN, secrets, OAuth
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml exec api npx prisma db seed
```

Four decisions in that file each close a failure mode invisible until production:

- **Redis is pinned to `--maxmemory-policy noeviction`.** BullMQ requires it.
  Any other policy evicts keys under memory pressure — including delayed jobs —
  silently destroying the restart guarantee. Most managed Redis free tiers evict
  by default, which is why this stack runs its own.
- **Migrations are a one-shot service.** API and worker both gate on
  `service_completed_successfully`, so neither starts against a stale schema.
- **Caddy routes `/api/*` to the API, everything else to the frontend** — one
  origin, so no CORS, one certificate, one DNS record.
- **The worker is its own service sharing the API's image**, built once so the
  two cannot drift. `--scale worker=3` is safe with no code change.

> **On hosting choice.** This architecture needs three always-on components: a
> worker that never sleeps, Redis with persistence, and MySQL. Free platform
> tiers target stateless request/response apps and break at least one — services
> that sleep, workers behind a paywall, or Redis that evicts. A small VPS (2 GB
> RAM minimum) is the honest floor.

---

## Assumptions and trade-offs

**Hosting is a Cloudflare Tunnel, not a platform deploy.** Railway's trial caps
service provisioning below what four services need, Render's free tier was
unavailable on this account, Koyeb was down, and Aiven never finished
provisioning. The tunnel gives a real HTTPS URL from the same stack;
`docker-compose.prod.yml` is the production path and builds cleanly.

**`Campaign.createdBy` is not yet authenticated.** The frontend forwards the
session email in an `x-user-email` header. That header is caller-controlled and
**must not be trusted for authorisation** — flagged with a TODO in
`src/lib/currentUser.ts`. Verifying the NextAuth session server-side is the fix.

**Ordering after a rate-limit requeue is best-effort.** The stagger only roughly
preserves order. Once several workers interleave — each hitting the limit at a
different moment, with retries in the mix — jobs can requeue out of sequence.
Strict ordering would need a single-consumer queue per sender, costing exactly
the throughput concurrency buys.

**Duplicate recipients are dropped, not rejected.** Sending one person the same
campaign twice is more likely a mistake than an intent. The count returns as
`duplicatesRemoved` so it is visible rather than silent.

**Recipients are capped at 5000 per campaign**, and the scheduling transaction
timeout is raised to 30s — Prisma's 5s default would abort a large fan-out well
before MySQL struggled.

**The email regex is deliberately permissive.** It is an extraction pass over
messy CRM exports, not RFC-5322 validation. The backend re-validates every
address with Zod, so a false positive costs a clear 400 — whereas an over-strict
regex silently drops real leads.

**Compose is a dialog, not a dedicated route** — the flow is short and returns
you to the table you were already looking at.

**The UI does not pixel-match the Figma.** The file requires authentication and
could not be opened, so the layout was built from the written brief: every listed
element is present (header with name, email and avatar; logout; both tabs;
compose with all fields; both tables with loading and empty states), styled with
a consistent design-token system rather than copied measurements.

**No automated test suite.** Verification is the two scripts above plus manual
exercise of each path. A production deployment would want unit tests around the
rate limiter and claim guard, and integration tests over the scheduling
transaction.

**`Sender` carries a `poolIndex`** beyond the fields the brief listed. Without a
stable per-slot identity the seed cannot recognise an already-minted Ethereal
account, and `upsert` has no unique key to target.

**Shadow-database grant.** `prisma migrate dev` needs `CREATE DATABASE` rights
for its shadow database. `docker/mysql/init/01-grants.sql` grants that, scoped to
the `prisma_migrate_shadow_db%` pattern rather than `*.*`.
