# Task 5 Recovery / TDD Report — Reconcile SePay webhooks

## Status

`DONE`

Task 5 is implemented and verified. Accepted SePay events are persisted before
reconciliation, retryable duplicates resume, terminal duplicates are no-ops,
business mismatches become durable review records, and infrastructure failures
remain retryable. The public Route Handler authenticates the exact raw body
before parsing and returns only generic responses.

## Recovery state

The interrupted worker left these untracked files, which were preserved:

- `src/server/payments/reconcile-sepay.ts`
- `src/server/payments/reconcile-sepay.integration.test.ts`

No route files existed. Recovery started by running the reconciliation test
unchanged:

```text
npx vitest run src/server/payments/reconcile-sepay.integration.test.ts
Test Files  1 passed (1)
Tests       10 passed (10)
```

The earlier worker's test-first RED attempt is known to have stopped in global
setup with PostgreSQL `P1001` against sandboxed localhost before test
collection. With unrestricted permissions restored, the recovered reconciler
and its tests were already GREEN, so no second reconciliation RED was
fabricated.

## Local framework documentation read

Before adding Route Handler code, both required Next.js 16.2.11 guides were
read in full:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md`

The implementation follows the documented native `Request`/`Response` Route
Handler API and the one-shot request-body constraint.

## Route TDD cycle

Route tests were added before the route. The first focused run was RED for the
expected missing production module:

```text
npx vitest run src/app/api/webhooks/sepay/route.test.ts
FAIL Failed to resolve import "@/app/api/webhooks/sepay/route"
Test Files  1 failed (1)
```

After the minimal handler was added, the same focused suite was GREEN:

```text
npx vitest run src/app/api/webhooks/sepay/route.test.ts
Test Files  1 passed (1)
Tests       13 passed (13)
```

The tests protect:

- missing or malformed `X-SePay-Signature` returning 401 before side effects;
- HMAC validation against the exact raw request bytes;
- exactly one `request.text()` call;
- valid non-canonical JSON not being reserialized before HMAC validation;
- malformed JSON, schema failures, and account mismatch returning 400;
- trimmed `accountNumber` comparison with `VIETQR_ACCOUNT_NO`;
- `getBoss()` warmup occurring before reconciliation;
- matched, duplicate, and review results returning exact
  `{"success":true}` with HTTP 200;
- queue warmup and reconciliation infrastructure failures returning the
  generic `{"success":false}` with HTTP 500;
- Node.js runtime export.

## Reconciliation invariants verified

The recovered integration suite proves:

- a matching code and exact amount create one payment, mark the event matched,
  mark the order paid, decrement every item once, and enqueue once;
- missing code, unknown order, wrong amount, non-pending order, and
  insufficient stock persist the event as `REVIEW_REQUIRED`;
- every mismatch leaves payment, order, stock, and enqueue side effects
  untouched;
- a duplicate event still in `RECEIVED` resumes reconciliation;
- duplicate `MATCHED` and `REVIEW_REQUIRED` events return without side effects;
- a queue error rolls back payment/order/stock/event matching and leaves the
  already-persisted event in `RECEIVED` for retry;
- only Prisma `P2002` is treated as the accepted-event duplicate path;
- `PaymentBusinessError` is handled only after the payment transaction has
  rolled back and the event status has been reloaded;
- other database/queue failures are rethrown.

Neither the route nor reconciler logs raw payloads, signatures, account
numbers, or other PII. Failure responses contain no internal exception detail.

## Verification

Prescribed focused suite:

```text
npx vitest run src/lib/sepay.test.ts src/server/payments/reconcile-sepay.integration.test.ts src/app/api/webhooks/sepay/route.test.ts
Test Files  3 passed (3)
Tests       36 passed (36)
```

Additional verification:

```text
npm run test
Test Files  48 passed (48)
Tests       334 passed (334)

npm run lint
exit 0

npx tsc --noEmit
exit 0

npm run build
exit 0
```

The production build lists `ƒ /api/webhooks/sepay`. It also emits two
non-blocking, pre-existing worktree/environment warnings: Next.js infers the
outer repository as the workspace root because both it and the worktree have a
lockfile, and Turbopack reports a broad NFT trace through the existing uploads
route. Task 5 introduced neither warning.

## Files

- `src/server/payments/reconcile-sepay.ts`
- `src/server/payments/reconcile-sepay.integration.test.ts`
- `src/app/api/webhooks/sepay/route.ts`
- `src/app/api/webhooks/sepay/route.test.ts`
- `.superpowers/sdd/2026-07-25-day7-payments/task-5-report.md`
