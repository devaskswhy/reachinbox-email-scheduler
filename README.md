# ReachInbox Scheduler

A production-grade email scheduling system: upload a lead list, schedule a
campaign, and have it delivered at a controlled rate across a pool of sender
accounts — surviving process and container restarts without dropping or
duplicating a single email.

---

## Overview

You upload a `.csv` or `.txt` lead list, write a subject and body, pick a start
time and a delay between sends, and the system takes it from there. Each
recipient becomes one row in the database and one delayed job in Redis. A
separate worker process drains the queue, spacing sends apart and respecting a
per-sender hourly ceiling, and records where every message ended up.

**There is no cron anywhere.** No `crontab`, no `node-cron`, no `setInterval`
polling loop. Scheduling is done entirely by BullMQ delayed jobs, and a
reconciler that runs **once at boot** repairs the one gap that delayed jobs
alone cannot cover. See [Architecture](#architecture).

### Stack

| Layer    | Choice                                                               |
| -------- | -------------------------------------------------------------------- |
| Monorepo | pnpm workspaces (`apps/backend`, `apps/frontend`, `packages/shared`) |
| API      | Express 4 + TypeScript, Zod validation                               |
| Queue    | BullMQ 5 on Redis 7 (AOF persistence)                                |
| Database | MySQL 8 via Prisma 6                                                 |
| Mail     | Nodemailer → Ethereal (test inboxes)                                 |
| Frontend | Next.js 14 App Router, Tailwind, shadcn/ui, TanStack Query           |
| Auth     | NextAuth (Google provider, JWT sessions)                             |

### Repository layout

```
apps/
  backend/
    prisma/            schema, migrations, Ethereal seed
    scripts/           simulate-load.ts, test-restart-survival.ts
    src/
      config/          env parsing and validation
      mail/            transporter cache + send
      queue/           queue, enqueue, reconciler, worker, rate limiter
      routes/          Express routes
      services/        campaign scheduling transaction
      validation/      Zod schemas
      server.ts        API entrypoint
      worker.ts        worker entrypoint (separate process)
  frontend/
    src/app/           App Router pages
    src/components/    DataTable, compose dialog, primitives
    src/lib/           API client, parsing, formatting
packages/
  shared/              types shared by both apps
```

---

## Setup

### Prerequisites

- **Node.js 18.17+** (developed on 25.x)
- **pnpm 9+** — `npm install -g pnpm`
- **Docker Desktop** — for MySQL and Redis

### 1. Install and configure

```bash
git clone https://github.com/devaskswhy/reachinbox-email-scheduler.git
cd reachinbox-email-scheduler
pnpm install

cp .env.example .env
```

There is **one `.env` at the repository root** — not one per package. Both apps
walk up to find it (`apps/backend/src/config/loadRootEnv.ts`,
`apps/frontend/next.config.mjs`), so there is no second copy to keep in sync.

### 2. Start the datastores

```bash
pnpm docker:up      # docker compose up -d
```

This starts:

| Service | Container          | Host port | Notes                                |
| ------- | ------------------ | --------- | ------------------------------------ |
| Redis 7 | `reachinbox-redis` | `6380`    | `--appendonly yes` on a named volume |
| MySQL 8 | `reachinbox-mysql` | `3307`    | named volume, `reachinbox` database  |

Non-default host ports are deliberate — they avoid colliding with a local MySQL
or Redis you may already be running. Both use **named volumes**, so data
survives `docker compose down` (use `down -v` to wipe).

Wait for both to report healthy:

```bash
docker compose ps
```

### 3. Create the schema and mint Ethereal senders

```bash
pnpm --filter @reachinbox/backend db:migrate    # applies migrations
pnpm --filter @reachinbox/backend db:seed       # creates Ethereal inboxes
```

### 4. Google OAuth (required for login)

1. Go to <https://console.cloud.google.com/apis/credentials>
2. **Create credentials → OAuth client ID → Web application**
3. Add this **Authorised redirect URI**, exactly:
   ```
   http://localhost:3001/api/auth/callback/google
   ```
4. Copy the client ID and secret into `.env` as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`
5. Generate a session secret:
   ```bash
   openssl rand -base64 32     # paste into NEXTAUTH_SECRET
   ```

Without these the app still builds and runs; it logs a startup warning and a
sign-in attempt lands back on `/login` with a readable message.

> `NEXTAUTH_URL` **must** match the address the frontend actually serves on
> (default `http://localhost:3001`). A mismatch makes Google reject the
> callback.

### 5. Run it

```bash
pnpm dev
```

That runs three processes concurrently — API, worker, and frontend:

| Process  | URL / role                  |
| -------- | --------------------------- |
| API      | <http://localhost:4001>     |
| Worker   | no port; consumes the queue |
| Frontend | <http://localhost:3001>     |

Or run them separately, in three terminals:

```bash
pnpm --filter @reachinbox/backend dev        # API, watch mode
pnpm --filter @reachinbox/backend worker     # worker
pnpm --filter @reachinbox/frontend dev       # frontend
```

**The worker is a genuinely separate process.** It never binds a port, and the
API never consumes the queue. Either can be killed and restarted independently
without the other noticing — that independence is what the restart-survival
test exercises.

### Production build

```bash
pnpm build
pnpm --filter @reachinbox/backend start          # node dist/server.js
pnpm --filter @reachinbox/backend start:worker   # node dist/worker.js
pnpm --filter @reachinbox/frontend start
```

### Running via Docker

`docker-compose.yml` provisions **MySQL and Redis only**; the API, worker and
frontend run on the host. This is deliberate for an assignment — it keeps
hot reload and debugger attach working with no volume-mount or rebuild step.

To containerise the apps as well, add services with `DATABASE_URL` pointing at
`mysql://reachinbox:reachinbox@mysql:3306/reachinbox` and `REDIS_URL` at
`redis://redis:6379` (in-network ports, not the published `3307`/`6380`), and
run the worker as its own service so it scales independently of the API.

```bash
pnpm docker:up      # start MySQL + Redis
pnpm docker:down    # stop them (named volumes are kept)
```

---

## Ethereal email

[Ethereal](https://ethereal.email) is a fake SMTP service: it accepts mail and
shows it in a webmail inbox, but never delivers to the real world. That makes
it safe to run thousands of simulated sends.

### How senders are created

```bash
pnpm --filter @reachinbox/backend db:seed
```

The seed reads `SENDER_POOL_SIZE` and, **for each pool slot that does not
already exist**, calls Nodemailer's `createTestAccount()` to mint a real
Ethereal inbox, then stores its host, port, user and password on the `Sender`
row. It prints each account's credentials.

**The seed is idempotent.** Re-running it never mints a new account for a slot
that already has one and never overwrites stored credentials — those inboxes
hold prior test sends worth keeping. Running it twice reports
`0 created, N reused`.

> **Implementation note.** `nodemailer.createTestAccount()` caches its result
> in-process and returns the _same_ account for every call in a single process
> — five calls a second apart still return one inbox. The seed sets
> `ETHEREAL_CACHE=false` before importing nodemailer (via dynamic import, since
> ESM hoists static ones) so each pool slot gets a distinct inbox.

### Viewing sent mail

Two ways:

1. **From the dashboard** — click any row on the **Sent Emails** tab. It opens
   that message's Ethereal preview URL, stored on
   `EmailJob.providerMessageId`, in a new tab.
2. **From the webmail** — sign in at <https://ethereal.email/login> with any
   sender's credentials from the seed output to browse its whole inbox.

### Simulating failures

`SIMULATE_SMTP_FAILURE_RATE` throws **before** any network call, so an injected
failure never leaves a real message delivered and then retried. Set it to `0.5`
to watch retry/backoff and the terminal `FAILED` state:

```bash
SIMULATE_SMTP_FAILURE_RATE=0.5 pnpm --filter @reachinbox/backend worker
```

---

## Environment variables

All read from the single root `.env`. See `.env.example`.

| Variable                         | Default                 | Used by     | Description                                                                                                   |
| -------------------------------- | ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                   | —                       | backend     | MySQL connection string. **Required.** Matches the compose service on host port `3307`.                       |
| `REDIS_URL`                      | —                       | backend     | Redis connection string, BullMQ's backing store. **Required.** Host port `6380`.                              |
| `PORT`                           | `4001`                  | backend API | Port the Express API listens on.                                                                              |
| `WORKER_CONCURRENCY`             | `5`                     | worker      | Jobs a single worker process handles in parallel.                                                             |
| `MIN_DELAY_MS_BETWEEN_SENDS`     | `2000`                  | worker      | Minimum spacing between two sends, enforced **queue-wide** by the BullMQ limiter — not per process.           |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `200`                   | worker      | Hourly ceiling per sender when `RATE_LIMIT_MODE=per-sender`.                                                  |
| `MAX_EMAILS_PER_HOUR`            | `1000`                  | worker      | Ceiling for the single shared bucket when `RATE_LIMIT_MODE=global`.                                           |
| `RATE_LIMIT_MODE`                | `per-sender`            | worker      | `per-sender` (one bucket each) or `global` (one shared bucket). The legacy `per_sender` spelling is accepted. |
| `SENDER_POOL_SIZE`               | `3`                     | seed        | Number of Ethereal accounts the seed maintains.                                                               |
| `SIMULATE_SMTP_FAILURE_RATE`     | `0`                     | worker      | Probability (0–1) a send throws before touching SMTP. `0` disables it.                                        |
| `NEXTAUTH_URL`                   | `http://localhost:3001` | frontend    | Canonical frontend URL. **Must match** the OAuth redirect origin.                                             |
| `NEXTAUTH_SECRET`                | —                       | frontend    | Signs session JWTs. Generate with `openssl rand -base64 32`.                                                  |
| `GOOGLE_CLIENT_ID`               | —                       | frontend    | Google OAuth client id.                                                                                       |
| `GOOGLE_CLIENT_SECRET`           | —                       | frontend    | Google OAuth client secret.                                                                                   |
| `NEXT_PUBLIC_BACKEND_URL`        | `http://localhost:4001` | frontend    | Backend base URL. `NEXT_PUBLIC_` exposes it to the browser — **never put a secret here.**                     |

A campaign's own `hourlyLimit`, when set in the compose form, overrides
whichever global ceiling applies.

---

## Architecture

### Scheduling — BullMQ delayed jobs, no cron

`POST /api/campaigns/schedule` does two things, in this order:

1. **Inside one Prisma transaction:** create the `Campaign`, then one
   `EmailJob` per recipient with `status = PENDING`, a `senderId` assigned
   **round-robin** across the pool, and
   `scheduledFor = startTime + (index × delayMs)`.
2. **After the transaction commits:** enqueue each row onto BullMQ and advance
   it to `QUEUED`.

The ordering matters. Enqueuing inside the transaction would risk the worker
picking up a job whose row is not yet committed and reading a row that does not
exist. Committing first means the worst case is a row with no job — which the
reconciler repairs.

Each job is added with `delay = scheduledFor − now`, so **Redis itself holds the
schedule**. Nothing polls the database asking "is anything due yet?" — BullMQ
promotes a delayed job to the ready set when its time arrives.

Round-robin assignment matters for throughput: consecutive recipients land on
different senders, so a per-sender hourly ceiling binds much later than it would
if one identity sent everything.

The job payload carries **only `{ emailJobId }`** — never the recipient,
subject, or body. The worker re-reads the row at send time, so a job that sat
delayed for hours cannot deliver a stale copy of an edited campaign, and Redis
memory stays flat regardless of body size.

### Restart persistence — three mechanisms, one guarantee

There are exactly two ways a scheduled email could be lost, and each has a
specific countermeasure. Both are documented in detail in the code:
`apps/backend/src/queue/reconcile.ts` and `apps/backend/src/queue/enqueue.ts`.

**1. The process or container restarts after the job was queued.**
Covered by **Redis AOF persistence** — compose starts Redis with
`--appendonly yes` on a named volume. A delayed job is ordinary Redis state, so
it is replayed from the append-only file on restart and fires at its original
time. Without AOF, every delayed job still waiting would evaporate when the
container recycled.

**2. The process died between the database commit and the Redis add.**
Redis persistence cannot help — the job never reached Redis. The row sits in
MySQL as `PENDING` with nothing scheduled to act on it. This is the window the
**reconciler** closes.

`reconcilePendingJobs()` selects every row in `PENDING`, `QUEUED` or
`RESCHEDULED` and re-enqueues it. It runs **once at boot in both the API and
the worker**, before either accepts work — whichever process comes up first
performs the repair.

A blanket re-enqueue of every outstanding row is safe rather than a source of
duplicates because of **`jobId` dedupe**: the BullMQ job id _is_ the database
row id. BullMQ treats job ids as unique within a queue, so `add` for an id
already present silently returns the existing job. Rows that survived in Redis
are recognised and skipped; only genuinely missing ones are added. The
reconciler is therefore a **no-op on a clean restart and a repair pass on a
dirty one**, without needing to know which kind of restart occurred.

> A completed job is eventually evicted by `removeOnComplete`, freeing its id
> for reuse. That does not reopen a duplicate-send hole, because the reconciler
> only ever selects `PENDING`/`QUEUED`/`RESCHEDULED`. A delivered row is `SENT`
> and is never handed back. **The database status is the source of truth for
> "has this been sent"; Redis is only the scheduling mechanism.**

Running the reconciler once at boot is sufficient precisely because it is _not_
a poller — steady-state scheduling is BullMQ's job, and this exists only to
reconcile database truth with Redis state at startup.

Verify it yourself with `pnpm --filter @reachinbox/backend test:restart`
(see [Verification scripts](#verification-scripts)).

### Rate limiting and concurrency

Four mechanisms, each solving a different problem. All are in
`apps/backend/src/queue/worker.ts` and `rateLimiter.ts`.

**Worker concurrency (`WORKER_CONCURRENCY`).**
How many jobs one worker handles in parallel. Sends are I/O-bound — most of the
time is spent waiting on an SMTP round trip — so overlapping them is close to
free.

**Atomic claim — what makes concurrency safe.**
The first thing the processor does is one conditional update:

```ts
UPDATE email_jobs SET status = 'SENDING'
WHERE id = ? AND status IN ('PENDING','QUEUED','RESCHEDULED')
```

If it affects 0 rows, someone else already claimed or completed the job and the
processor returns without touching SMTP. MySQL serialises the row write, so
exactly one caller can win. This is also the guard against BullMQ's stalled-job
recovery: if a worker is paused long enough to lose its lock, BullMQ hands the
job to a second worker — and without this claim, both would send.

**Minimum spacing (`MIN_DELAY_MS_BETWEEN_SENDS`).**
The BullMQ `limiter: { max: 1, duration: N }` is a **queue-wide token bucket
held in Redis**, not a per-process sleep. `max: 1` per `N` ms means "at most one
send _begins_ every N ms, system-wide" — it keeps holding when a second worker
container starts, and it throttles job _starts_, leaving concurrency free to
overlap the SMTP round-trips that follow.

**Hourly ceiling — Redis hour-bucket counters.**
Before sending, the worker reserves a slot:

```
key   = ratelimit:{senderId}:{YYYY-MM-DDTHH}     # UTC hour bucket
count = INCR key
if count == 1: EXPIRE key 3600
```

`INCR` is atomic, so concurrent workers cannot both read the same value and each
conclude there is room. `EXPIRE` is issued **only when `INCR` returns exactly
1** — by whichever worker created the key. Setting it on every call would slide
the TTL forward forever and the bucket would never reset. Buckets are UTC, since
a local-time bucket would double or skip a window at a daylight-saving boundary.

**Over the limit — requeue, never fail.**
If the count exceeds the limit the worker:

1. **Decrements the counter back** — this job did not consume a slot. Without
   this, a burst of rejected jobs would inflate the counter and suppress sends
   that should have been allowed in the same window.
2. Sets the row to `RESCHEDULED` with an explanatory `lastError`.
3. Computes the start of the next hour window plus a small stagger derived from
   the job's original position, and calls `job.moveToDelayed(runAt, token)`.

The job is **deferred, never failed and never dropped** — no attempt is
consumed, and `lastError` is informational rather than a failure record.

> **Ordering trade-off, stated plainly.** The stagger only _roughly_ preserves
> the original send order. Once several workers interleave — each hitting the
> limit at a slightly different moment, with retries and backoff in the mix —
> jobs can be re-queued out of sequence and two can land on the same
> millisecond. Ordering here is **best-effort, not a guarantee**. Strict
> ordering would need a single-consumer queue per sender, which costs exactly
> the throughput that concurrency buys.

> **Implementation note.** After `moveToDelayed` the job is no longer active and
> the worker no longer holds its lock, so returning normally would make BullMQ
> try to complete it and throw a missing-lock error. The processor throws
> `DelayedError`, which is how BullMQ v5 signals "already moved, leave it
> alone".

**Retries.** Jobs are enqueued with `attempts: 3` and exponential backoff from
5s (5s → 10s → 20s). A thrown SMTP error increments `attempts`, records
`lastError`, and rethrows so BullMQ applies the policy. Only the final attempt
sets `FAILED`; earlier ones return the row to `QUEUED` so it still reads as
outstanding work — and so the reconciler would recover it if the process died
before BullMQ retried.

### Dashboard refresh strategy

The **Scheduled Emails** tab **polls every 15 seconds** (TanStack Query
`refetchInterval`) rather than offering a manual refresh button. Scheduled rows
change state on their own as the worker drains the queue — `QUEUED → SENDING →
SENT`, or `→ RESCHEDULED` when the limiter defers one. None of those
transitions is caused by anything the viewer does, so there is no user action to
hang a refresh off, and a manual button would leave a stale table looking
authoritative. `refetchIntervalInBackground` is off, so a hidden tab stops
polling and resumes on focus.

The **Sent Emails** tab does **not** poll — `SENT` and `FAILED` are terminal, so
a row already on screen can never change. Scheduling a campaign invalidates the
scheduled list directly, so new rows appear immediately rather than after the
next tick.

---

## Verification scripts

### Behaviour under load

```bash
pnpm --filter @reachinbox/backend simulate:load
pnpm --filter @reachinbox/backend simulate:load -- --recipients 5000
```

Schedules 1000 recipients through the **real** scheduling service — same
transaction, same round-robin, same post-commit enqueue — then runs the
reconciler. **Nothing is sent:** the worker is never started, so no SMTP
connection is opened and no Ethereal quota is consumed.

It reports the per-sender hour-bucket projection and asserts that the number
requested equals the rows in MySQL equals the jobs found in Redis.

Measured result (1000 recipients, 3 senders, limit 200/hour):

```
Integrity
  requested          : 1000
  rows in database   : 1000
  jobs found in Redis: 1000
  dropped            : 0
  RESULT             : OK

  sender 0   334 jobs   2026-08-26T09: 200   2026-08-26T10: 134
  sender 1   333 jobs   2026-08-26T09: 200   2026-08-26T10: 133
  sender 2   333 jobs   2026-08-26T09: 200   2026-08-26T10: 133
```

Scheduling 1000 rows took **689 ms**; the reconciler scanned all 1000 in
**1138 ms** and added nothing (every job was already in Redis).

### Restart survival

```bash
# Terminal 1 — worker running
pnpm --filter @reachinbox/backend worker

# Terminal 2
pnpm --filter @reachinbox/backend test:restart
```

Schedules five emails two minutes out, prints their state, then asks you to kill
and restart the worker. In an interactive terminal it waits for Enter and
verifies automatically; otherwise run the second phase yourself:

```bash
pnpm --filter @reachinbox/backend test:restart -- --verify
```

It asserts three things: no duplicate rows exist, every job still owing a send
is still present in BullMQ, and nothing was sent before its scheduled time.

Measured result — worker killed mid-flight and restarted:

```
  restart-0@example.invalid  SENT  scheduled 08:43:12.098  sent 08:43:15.439
  restart-1@example.invalid  SENT  scheduled 08:43:17.098  sent 08:43:20.152
  restart-2@example.invalid  SENT  scheduled 08:43:22.098  sent 08:43:25.627
  restart-3@example.invalid  SENT  scheduled 08:43:27.098  sent 08:43:28.183
  restart-4@example.invalid  SENT  scheduled 08:43:32.098  sent 08:43:33.179

  no duplicate rows             : PASS (5 rows for 5 recipients)
  outstanding jobs still queued : PASS
  nothing sent before its time  : PASS (5 sent, 0 early)
  RESULT: PASS
```

All five survived the kill in Redis, the restarted worker's reconciler added
nothing, and every send happened after its scheduled time.

---

## Features implemented

### Backend

**Scheduler**

- [x] `POST /api/campaigns/schedule` — Zod-validated: rejects empty recipients,
      malformed addresses, and a `startTime` more than 5 minutes in the past
- [x] Campaign and one `EmailJob` per recipient created in a single transaction
- [x] `scheduledFor = startTime + (index × delayMs)` — recipients spread out
- [x] Senders assigned round-robin across the pool
- [x] BullMQ delayed jobs — **no cron, no `node-cron`, no `setInterval`**
- [x] `GET /api/campaigns/scheduled` — paginated, joined with campaign + sender
- [x] `GET /api/campaigns/sent` — paginated, terminal states
- [x] `GET /api/health` — reports 503 when the database is unreachable
- [x] Central error handler with a consistent `{ error, details? }` shape

**Persistence / restart safety**

- [x] Redis AOF (`--appendonly yes`) on a named volume — delayed jobs survive a
      container restart
- [x] Idempotent enqueue — the BullMQ `jobId` _is_ the `EmailJob` id, so a
      repeat add is a silent no-op
- [x] `reconcilePendingJobs()` at boot in **both** the API and the worker,
      before either accepts work
- [x] MySQL data on a named volume
- [x] Verified by `test-restart-survival.ts`

**Rate limiting**

- [x] Minimum delay between sends — queue-wide BullMQ limiter, not per process
- [x] Per-sender hourly ceiling via atomic Redis `INCR` on UTC hour buckets
- [x] `EXPIRE` set only on bucket creation, so the window actually resets
- [x] Counter decremented on refusal, so rejected jobs do not inflate it
- [x] `global` and `per-sender` modes; per-campaign `hourlyLimit` override
- [x] Over-limit jobs `moveToDelayed` into the next window — never failed,
      never dropped

**Concurrency**

- [x] Configurable worker concurrency
- [x] Atomic claim (`updateMany` guarded on status) prevents double-sends
- [x] Guards BullMQ stalled-job recovery, not just parallel workers
- [x] Worker runs as a separate process, restartable independently of the API
- [x] Retries with exponential backoff; `FAILED` only once attempts are spent
- [x] Graceful shutdown drains in-flight jobs and closes pooled SMTP sockets
- [x] Verified by `simulate-load.ts` — 1000 jobs, 0 dropped

### Frontend

**Login**

- [x] Google OAuth via NextAuth, JWT session strategy
- [x] Centred card with a Continue with Google button and logo placeholder
- [x] Middleware redirects unauthenticated users from `/dashboard/*` to
      `/login`, preserving the intended destination as `callbackUrl`
- [x] Middleware redirects authenticated users away from `/login`
- [x] Readable error message when OAuth is misconfigured

**Dashboard**

- [x] Header: app name left; avatar, name, email and Logout right
- [x] Scheduled / Sent tabs as real routes — linkable and back-button friendly
- [x] Compose New Email button aligned opposite the tabs
- [x] Design tokens in `tailwind.config.ts`: one accent bound to
      `--primary`/`--ring`, one easing curve as the Tailwind default
- [x] `prefers-reduced-motion` respected

**Compose**

- [x] Subject and body fields
- [x] Drag-and-drop plus click-to-browse upload, `.csv` and `.txt`
- [x] Client-side parsing — papaparse for CSV, line split for TXT
- [x] Live "N valid email addresses detected", plus skipped and duplicate counts
- [x] Case-insensitive de-duplication
- [x] Start time, delay in seconds, optional hourly limit
- [x] Schedule disabled until subject, body and ≥1 recipient are present
- [x] Loading state, success toast, error toast carrying the backend's message
- [x] Built from reusable primitives — `Modal`, `FormField`, `FileDropzone`

**Tables**

- [x] One generic `DataTable` used by both tabs
- [x] TanStack Query with a root `QueryClientProvider`
- [x] Scheduled polls every 15s; Sent does not (terminal states)
- [x] Status badges — a distinct tone per status, green/red reserved for
      terminal outcomes
- [x] Times formatted in the **viewer's** timezone via `Intl`
- [x] Skeleton rows while loading, not a spinner
- [x] Centred empty state with a Compose button that opens the same dialog
- [x] Inline error banner with Retry instead of a blank table
- [x] Clicking a sent row opens its Ethereal preview in a new tab
- [x] Staggered row entrance, capped so a large table still feels immediate

---

## Assumptions & Trade-offs

**`Campaign.createdBy` is not yet authenticated.** The frontend forwards the
session email in an `x-user-email` header and the backend records it. That
header is caller-controlled and **must not be trusted for authorisation** — it
is marked with a TODO in `apps/backend/src/lib/currentUser.ts`. Verifying the
NextAuth session server-side is the fix.

**Ordering after a rate-limit requeue is best-effort.** Detailed above; strict
ordering would cost the throughput concurrency buys.

**Duplicate recipients are dropped, not rejected.** Sending one person the same
campaign twice is more likely a mistake than an intent. The count is returned as
`duplicatesRemoved` so it is visible rather than silent.

**Recipients are capped at 5000 per campaign**, and the scheduling transaction
timeout is raised to 30s. Prisma's 5s default would abort a large fan-out well
before MySQL struggled.

**The email regex is deliberately permissive.** It is an extraction pass over
messy CRM exports, not RFC-5322 validation. The backend re-validates every
address with Zod, so a false positive costs a clear 400 — whereas an
over-strict regex silently drops real leads.

**Compose is a dialog, not a dedicated route.** Chosen because the flow is short
and returns you to the table you were already looking at.

**Only MySQL and Redis are containerised.** Reasoning above.

**No automated test suite.** Verification is via the two scripts here plus
manual exercise of each path. A real deployment would want unit tests around the
rate limiter and claim guard, and integration tests over the scheduling
transaction.

**The `Sender` model carries a `poolIndex`** beyond the fields the brief listed.
Without a stable per-slot identity the seed cannot recognise an already-minted
Ethereal account, and `upsert` has no unique key to target.

**Shadow-database grant.** `prisma migrate dev` needs `CREATE DATABASE` rights
to build its shadow database. `docker/mysql/init/01-grants.sql` grants that,
scoped to the `prisma_migrate_shadow_db%` name pattern rather than `*.*`.
