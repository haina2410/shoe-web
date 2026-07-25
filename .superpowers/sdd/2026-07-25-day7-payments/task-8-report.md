# Task 8 report — Expose payment state and prove the end-to-end flow

## Status

Implemented and fully verified in the isolated worktree:

```text
/Users/nam/Documents/nam/shoe/.worktrees/day7-payments
```

Branch: `feat/day7-payments`

The public order page now renders every database order status exhaustively,
keeps VietQR and transfer instructions exclusive to pending orders, exposes
the raw integer total for the browser contract, and refreshes to a paid
presentation after the real signed webhook flow.

## Framework guidance read

Before editing the dynamic page, the local Next.js 16.2.11 documentation was
read:

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`

The implementation preserves `export const dynamic = "force-dynamic"` and
continues to await the promised dynamic `params` before reading `orderCode`.

## Baseline

The worktree was clean and confirmed to be a linked Git worktree on
`feat/day7-payments`.

Command:

```bash
npm run test -- --reporter=dot
```

Result:

```text
Test Files  52 passed (52)
Tests       360 passed (360)
Duration    44.52s
```

The baseline emitted two intentional stderr lines from checkout action tests
that simulate database/queue connection failures and verify that internal
details are not returned to clients. They pre-date Task 8.

## Strict TDD evidence

### RED

Created `src/app/orders/[orderCode]/page.test.tsx` before changing the page.
The tests mock only the Prisma and VietQR boundaries and exercise the real
async Server Component.

Command:

```bash
npx vitest run 'src/app/orders/[orderCode]/page.test.tsx'
```

Observed expected RED:

```text
Test Files  1 failed (1)
Tests       6 failed (6)
```

All six status cases failed because the existing page did not expose
`order-status`, hardcoded the pending presentation for every persisted
status, always rendered QR, and lacked the raw `data-total`.

The cases cover:

- `PENDING_PAYMENT`;
- `PAID`;
- `FULFILLED`;
- `COMPLETED`;
- `EXPIRED`;
- `CANCELLED`.

### GREEN

Implemented an exhaustive `Record<OrderStatus, ...>` presentation map:

- `PENDING_PAYMENT` → `Chờ thanh toán`, QR and transfer instructions;
- `PAID`, `FULFILLED`, `COMPLETED` → `Đã thanh toán`, paid confirmation,
  no QR or transfer instruction;
- `EXPIRED` → `Đã hết hạn`, inactive explanation, no QR;
- `CANCELLED` → `Đã hủy`, inactive explanation, no QR.

`vietQrConfigFromEnv()` and QR URL construction now execute only inside the
pending section. The visible total retains its formatted VND text and adds
`data-total="<integer>"`.

Command:

```bash
npx vitest run 'src/app/orders/[orderCode]/page.test.tsx' src/app/checkout/page.test.tsx
```

Result:

```text
Test Files  2 passed (2)
Tests       12 passed (12)
```

## Signed webhook E2E

`e2e/checkout.spec.ts` now completes the guest journey and then:

1. reads `orderCode` from the URL and the literal integer total from
   `data-total`;
2. constructs the complete accepted SePay payload shape with a unique numeric
   `id`;
3. serializes the payload once with `JSON.stringify(payload)`;
4. signs the exact raw string as
   `HMAC-SHA256(secret, timestamp + "." + rawBody)`;
5. sends that same raw string with `X-SePay-Timestamp` and
   `X-SePay-Signature: sha256=<hex>`;
6. asserts HTTP 200 and exact JSON `{ success: true }`;
7. reloads the force-dynamic order page and asserts `Đã thanh toán`, no QR,
   and no transfer instruction.

The ignored `.env` was neither edited nor printed. The test command supplied
an ephemeral `SEPAY_WEBHOOK_SECRET` assignment so Playwright and its webServer
inherited the same value. No email worker was started; the web process only
initialized pg-boss so the confirmation job could be enqueued transactionally.

Before E2E, `npx prisma migrate deploy` checked the development database:

```text
5 migrations found
No pending migrations to apply.
```

Focused browser result:

```text
1 passed (11.8s)
```

## Operational documentation

Updated:

- `README.md`;
- `docs/04-payment-checkout-flow.md`;
- `docs/06-plan-10-days.md`.

They now document:

- required `SEPAY_WEBHOOK_SECRET`;
- exact timestamp-prefixed raw-body HMAC headers and five-minute window;
- exact HTTP 200 `{"success":true}` acknowledgement;
- official `payload.id` idempotency instead of fictional `transactionId`;
- persistence of authenticated unmatched events as
  `BankTransaction.REVIEW_REQUIRED` for Day 8;
- both email queues and the UTC `expire-unpaid` schedule handled by the
  separate worker.

## Final verification

All requested commands were run against the final implementation:

```text
npx prisma generate
  exit 0 — Prisma Client 7.9.0 generated

npm run lint
  exit 0 — no diagnostics

npm run test
  exit 0 — 53 files, 366 tests passed

npm run build
  exit 0 — production build and TypeScript passed

SEPAY_WEBHOOK_SECRET=<ephemeral-test-value> npm run test:e2e
  exit 0 — 6 tests passed

git diff --check
  exit 0 — no whitespace errors
```

## Pre-existing warnings recorded separately

The production build and Playwright webServer reproduced existing environment
warnings that are outside Task 8:

- Next.js workspace-root inference sees both the main checkout and linked
  worktree lockfiles;
- Turbopack reports the known unexpected NFT trace rooted at
  `src/app/api/uploads/[...path]/route.ts`;
- Playwright child processes report that `NO_COLOR` is ignored because
  `FORCE_COLOR` is set by the runner.

No new warning or error originates from the Task 8 page, webhook E2E, or
documentation changes.

## Requirement review and concerns

- All six Prisma `OrderStatus` members are explicit keys in a compile-time
  exhaustive map.
- The displayed label comes from the persisted `order.status`.
- QR and account details are rendered only for `PENDING_PAYMENT`.
- The order total remains public and formatted, with an integer-only
  machine-readable attribute.
- E2E exercises the production route, real development PostgreSQL state, real
  pg-boss transactional enqueue, and a force-dynamic page reload.
- The email worker remained stopped throughout browser verification.
- The real ignored `.env` was not changed or exposed.

No Task 8 blocker or unresolved functional concern remains. The known
Turbopack/worktree warnings remain pre-existing follow-up items.
