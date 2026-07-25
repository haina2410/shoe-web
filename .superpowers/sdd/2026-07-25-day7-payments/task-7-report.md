# Task 7 report — Expire unpaid orders on a worker schedule

## Status

Implemented and verified Task 7 in the isolated worktree
`/Users/nam/Documents/nam/shoe/.worktrees/day7-payments`.

## Baseline

Before editing, the worktree was clean on branch `feat/day7-payments`.

Command:

```bash
npm test
```

Result:

```text
Test Files  51 passed (51)
Tests       352 passed (352)
Duration    42.43s
```

The global test setup applied all five Prisma migrations to the real PostgreSQL
test database `leafshoes_test`; no migrations were pending.

## RED 1 — Expiry behavior

Created
`src/jobs/handlers/expire-unpaid.integration.test.ts` before the production
handler. The tests use `testPrisma` and the real PostgreSQL database. With
`now = 2026-07-25T12:00:00.000Z`, they cover:

- a `PENDING_PAYMENT` order one millisecond older than the 24-hour cutoff;
- a pending order exactly at `2026-07-24T12:00:00.000Z`;
- a pending order one millisecond newer than the cutoff;
- old `PAID` and `CANCELLED` orders;
- inventory stock before and after expiry;
- a repeated run returning `0`.

Command:

```bash
npx vitest run src/jobs/handlers/expire-unpaid.integration.test.ts
```

Expected RED result:

```text
Test Files  1 failed (1)
Tests       no tests
Error: Failed to resolve import "@/jobs/handlers/expire-unpaid"
```

The failure was caused only by the deliberately absent production handler.

## GREEN 1 — Conditional batch expiry

Added `expireUnpaidOrders({ db }, { now?, maxAgeHours? })`. It calculates the
cutoff from the injected time (defaulting to the current time) and default
maximum age of 24 hours, then performs exactly one database mutation:

```ts
db.order.updateMany({
  where: {
    status: OrderStatus.PENDING_PAYMENT,
    createdAt: { lt: cutoff },
  },
  data: { status: OrderStatus.EXPIRED },
});
```

It returns `result.count`. It does not query, increment, decrement, or otherwise
touch variant stock.

Command:

```bash
npx vitest run src/jobs/handlers/expire-unpaid.integration.test.ts
```

GREEN result:

```text
Test Files  1 passed (1)
Tests       2 passed (2)
Duration    1.46s
```

## RED 2 — Queue, schedule, and worker

Added the queue, schedule, registration, batch, non-PII logging, app-singleton,
and real pg-boss integration tests before their production exports existed.

Command:

```bash
npx vitest run src/jobs/queue.test.ts src/jobs/queue.integration.test.ts src/worker/index.test.ts src/jobs/worker.integration.test.ts
```

Expected RED result:

```text
Test Files  4 failed (4)
Tests       6 failed | 36 passed (42)
```

The six failures were the missing `QUEUE_EXPIRE_UNPAID`,
`ensureSchedules`, and `registerExpireUnpaidWorker` behavior:

- an undefined queue name was rejected by real pg-boss;
- `ensureSchedules` was not yet a function;
- `registerExpireUnpaidWorker` was not yet a function.

The 36 pre-existing assertions in those files remained green.

## GREEN 2 — Queue, stable schedule, and worker-only registration

Implemented:

- `QUEUE_EXPIRE_UNPAID = "expire-unpaid"`;
- expiry queue creation/update in `ensureQueues`;
- `ensureSchedules(boss)` using pg-boss 12.26.3's installed signature:

  ```ts
  await boss.schedule(
    QUEUE_EXPIRE_UNPAID,
    "*/15 * * * *",
    {},
    { tz: "UTC", key: "expire-unpaid-15m" },
  );
  ```

- worker startup ordering:
  `boss.start()` → `ensureQueues(boss)` → `ensureSchedules(boss)` → worker
  registrations;
- no `ensureSchedules` call from the app-side `getBoss()` singleton, whose
  default remains `schedule:false`;
- `registerExpireUnpaidWorker(boss, { db })`, iterating every job in a batch;
- failure logs containing only queue name and job ID, never payload, customer
  data, or exception text;
- a real pg-boss end-to-end test that sends an expiry job, waits for
  `completed`, and observes the old pending order become `EXPIRED`;
- a real pg-boss schedule persistence test proving repeated registration
  converges to one row with the exact queue, cron, timezone, key, and `{}` data.

The installed pg-boss 12.26.3 declarations were checked directly:
`schedule(name, cron, data?, options?)`, with `ScheduleOptions` containing
`tz?: string` and `key?: string`.

## Final verification

Exact command required by the Task 7 brief:

```bash
npx vitest run src/jobs/handlers/expire-unpaid.integration.test.ts src/jobs/queue.test.ts src/jobs/queue.integration.test.ts src/worker/index.test.ts src/jobs/worker.integration.test.ts
```

Result:

```text
Test Files  5 passed (5)
Tests       44 passed (44)
Duration    16.57s
Exit code   0
```

Additional repository hygiene check:

```bash
git diff --check
```

Result: exit code `0`, no whitespace errors.

## Requirement checklist

- [x] One `updateMany` only.
- [x] Only `PENDING_PAYMENT` orders are eligible.
- [x] `createdAt` is strictly less than the injected/default cutoff.
- [x] An order exactly at the cutoff remains pending.
- [x] Default maximum age is 24 hours.
- [x] Repeated execution is idempotent and returns `0`.
- [x] Stock is never touched.
- [x] Queue name is exactly `expire-unpaid`.
- [x] Queue exists before worker startup registers the schedule.
- [x] Cron is exactly `*/15 * * * *`.
- [x] Timezone is exactly `UTC`.
- [x] Stable schedule key is exactly `expire-unpaid-15m`.
- [x] Only the worker process schedules; the app singleton does not.
- [x] Worker registration processes all jobs in a batch.
- [x] Expiry worker logging contains no customer data.
- [x] Real PostgreSQL and real pg-boss integration paths are covered.

## Concerns

None blocking. The expiry queue currently inherits the same bounded
retry/backoff queue policy as the two email queues, so transient database
failures are retried without changing the expiry handler's idempotent behavior.
