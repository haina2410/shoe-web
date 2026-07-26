# Day 7 Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated SePay webhooks, durable reconciliation, atomic stock deduction, payment confirmation email, owner-only manual confirmation, unpaid-order expiry, and observable order payment status.

**Architecture:** Persist each validated SePay event in `BankTransaction`
before queue initialization, then reconcile only from those persisted columns.
Use a shared transactional payment primitive to conditionally claim the bank
event, move an order from `PENDING_PAYMENT` to `PAID`, decrement stock, create
`Payment`, update the event, and enqueue email atomically. Keep HTTP/Server
Action layers thin; pg-boss continues to run in a separate worker.

**Tech Stack:** Next.js 16.2.11 App Router, TypeScript 5, Prisma 7.9/PostgreSQL, Zod 4, pg-boss 12.26, React Email, Resend, Vitest 4, Playwright 1.61.

## Approved final provider-contract correction

The user approved one canonical payment/order-code format for the whole
system: `LEAFXXXXXX`, matching `^LEAF[A-Z0-9]{6}$`. There is no separator in
generated codes, URLs, VietQR content, emails, admin UI, webhook matching,
fixtures, seed/demo data, or current documentation.

The final migration converts historical values to the contiguous form without
changing `Order.id`, preserving uniqueness and relations. SePay payment-code
configuration must use prefix `LEAF` and a six-character alphanumeric suffix.

## Global Constraints

- Read the relevant local Next.js 16 guide in `node_modules/next/dist/docs/` before changing a Route Handler, Server Action, or App Router page.
- Follow strict RED → verify failure → GREEN → verify pass → REFACTOR for every behavior change.
- Never log raw SePay payloads, signatures, email, phone, address, bank account number, or job payload PII.
- Use `String(payload.id)` as SePay idempotency key; never invent a `transactionId` field in the provider payload.
- Persist the validated provider code and original parsed JSON object before
  queue warm-up; a retry must never replace canonical code/amount with a later
  request body.
- Verify HMAC against the exact raw body before JSON parsing; accept timestamp drift no greater than 300 seconds.
- A successful SePay acknowledgement is HTTP 200 with exact JSON `{"success":true}`; duplicate and business mismatch are successes only after durable persistence.
- Only `owner` may manually confirm payment. `staff` remains able to update ordinary order state later, but cannot perform this money-sensitive action.
- Stock changes only when payment is confirmed and must use conditional atomic decrements that can never make stock negative.
- Email jobs contain only `orderCode` and are inserted through `fromPrisma(tx)` in the same transaction as the business change.
- `PENDING_PAYMENT` expires after 24 hours; the worker schedules expiry every 15 minutes in UTC.
- Preserve existing guest checkout behavior and the public capability URL `/orders/[orderCode]`.
- Prisma generated client remains gitignored; run `npx prisma generate` after schema changes.

---

### Task 1: Persist inbound bank transactions

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260725120000_day7_bank_transactions/migration.sql`
- Modify: `src/test/db.ts`
- Create: `src/server/payments/bank-transactions.integration.test.ts`

**Interfaces:**
- Produces: Prisma enum `BankTransactionStatus` and model `BankTransaction`.
- Produces: `Order.bankTransactions`.
- Preserves: existing `Payment` as the record of a successfully matched payment.

- [ ] **Step 1: Write the failing schema integration test**

Create a test that inserts both a matched and an unmatched inbound event:

```ts
it("stores an unmatched SePay event without an order and enforces provider id uniqueness", async () => {
  const eventInput = {
    provider: "sepay",
    providerTransactionId: "987654",
    gateway: "MBBank",
    accountNumber: "0000000000",
    transferType: "in",
    amount: 350_000,
    content: "LEAFABC123",
    referenceCode: "FT24123",
    occurredAt: new Date("2026-07-25T03:00:00.000Z"),
    rawPayload: { id: 987654 },
  };
  const event = await testPrisma.bankTransaction.create({
    data: eventInput,
  });

  expect(event.status).toBe("RECEIVED");
  expect(event.orderId).toBeNull();
  await expect(
    testPrisma.bankTransaction.create({
      data: { ...eventInput, providerTransactionId: "987654" },
    }),
  ).rejects.toMatchObject({ code: "P2002" });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run src/server/payments/bank-transactions.integration.test.ts`

Expected: FAIL because `bankTransaction` and `BankTransactionStatus` do not exist.

- [ ] **Step 3: Add the schema and migration**

Add:

```prisma
enum BankTransactionStatus {
  RECEIVED
  MATCHED
  REVIEW_REQUIRED
}

model BankTransaction {
  id                    String                @id @default(cuid())
  provider              String
  providerTransactionId String                @unique
  gateway               String
  accountNumber         String
  transferType          String
  amount                Int
  paymentCode           String?
  content               String
  referenceCode         String?
  occurredAt            DateTime
  rawPayload            Json
  status                BankTransactionStatus @default(RECEIVED)
  reviewReason          String?
  orderId               String?
  order                 Order?                @relation(fields: [orderId], references: [id])
  processedAt           DateTime?
  createdAt             DateTime              @default(now())
  updatedAt             DateTime              @updatedAt

  @@index([status, createdAt])
  @@index([orderId])
  @@map("bank_transaction")
}
```

Add `bankTransactions BankTransaction[]` to `Order`. Create SQL with the
matching enum, table, foreign key and indexes. Update `resetDb()` so
`bank_transaction` is truncated before `order`.

- [ ] **Step 4: Generate client and verify GREEN**

Run:

```bash
npx prisma generate
npx prisma migrate deploy
npx vitest run src/server/payments/bank-transactions.integration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260725120000_day7_bank_transactions/migration.sql src/test/db.ts src/server/payments/bank-transactions.integration.test.ts
git commit -m "feat(payments): persist inbound bank transactions"
```

---

### Task 2: Validate and authenticate the SePay contract

**Files:**
- Create: `src/lib/sepay.ts`
- Create: `src/lib/sepay.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `sePayWebhookPayloadSchema`.
- Produces: `type SePayWebhookPayload`.
- Produces: `verifySePaySignature(input: { rawBody: string; signature: string | null; timestamp: string | null; secret: string; now?: Date }): boolean`.
- Produces: `orderCodeFromSePay(payload): string | null`.
- Produces: `occurredAtFromSePay(transactionDate: string): Date`.

- [ ] **Step 1: Write failing contract tests**

Use a complete official-shape literal payload. Include tests that catch:

```ts
expect(sePayWebhookPayloadSchema.parse(validPayload).id).toBe(123456);
expect(orderCodeFromSePay({ ...validPayload, code: " leaf-abc123 " })).toBe("LEAFABC123");
expect(orderCodeFromSePay({ ...validPayload, code: null })).toBeNull();
expect(() => sePayWebhookPayloadSchema.parse({ ...validPayload, transferAmount: 0 })).toThrow();
```

Build signatures independently with `createHmac` and assert:

- exact raw body succeeds;
- one-byte body change fails;
- malformed signature fails without throwing;
- timestamps at ±300 seconds succeed and ±301 seconds fail;
- missing secret is rejected by the caller-facing API.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run src/lib/sepay.test.ts`

Expected: FAIL because `src/lib/sepay.ts` is absent.

- [ ] **Step 3: Implement the minimal pure module**

Use Node `createHmac`, `timingSafeEqual`, strict hex decoding and:

```ts
const signedMessage = `${timestamp}.${rawBody}`;
const expected = createHmac("sha256", secret).update(signedMessage).digest();
```

The Zod schema must include `id`, `gateway`, `transactionDate`,
`accountNumber`, `subAccount`, `code`, `content`, `transferType`,
`description`, `transferAmount`, `accumulated`, and `referenceCode`.
`transferType` must be `"in"` and `transferAmount` a positive integer.
Accept empty `description` and `referenceCode`. Validate `transactionDate` as
exactly `YYYY-MM-DD HH:mm:ss`, reject impossible calendar dates by component
round-trip, and parse it as Vietnam local time (`+07:00`) when mapping it to
`occurredAt`. `orderCodeFromSePay` returns only canonical contiguous codes.

- [ ] **Step 4: Add the documented secret**

Add only the placeholder:

```dotenv
# SePay webhook HMAC-SHA256. Production must use a strong random secret.
SEPAY_WEBHOOK_SECRET="change-me"
```

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
npx vitest run src/lib/sepay.test.ts
npm run lint -- src/lib/sepay.ts src/lib/sepay.test.ts
```

Expected: PASS with no secret or payload printed.

```bash
git add src/lib/sepay.ts src/lib/sepay.test.ts .env.example
git commit -m "feat(payments): verify SePay webhook signatures"
```

---

### Task 3: Add payment-confirmed email jobs

**Files:**
- Modify: `src/jobs/queue.ts`
- Modify: `src/jobs/queue.test.ts`
- Modify: `src/jobs/queue.integration.test.ts`
- Create: `src/emails/payment-confirmed.tsx`
- Create: `src/emails/payment-confirmed.render.ts`
- Create: `src/emails/payment-confirmed.test.tsx`
- Create: `src/jobs/handlers/send-payment-confirmed.ts`
- Create: `src/jobs/handlers/send-payment-confirmed.integration.test.ts`
- Modify: `src/worker/index.ts`
- Modify: `src/worker/index.test.ts`
- Modify: `src/jobs/worker.integration.test.ts`

**Interfaces:**
- Produces: `QUEUE_SEND_PAYMENT_CONFIRMED = "send-payment-confirmed"`.
- Produces: `paymentConfirmedJobSchema` with only `{ orderCode: string }`.
- Produces: `enqueuePaymentConfirmed(tx, payload, boss?)`.
- Produces: `handleSendPaymentConfirmed({ db, mailer }, payload)`.
- Produces: `registerPaymentConfirmedWorker(boss, deps)`.

- [ ] **Step 1: Write failing queue and template tests**

Assert that:

```ts
expect(paymentConfirmedJobSchema.parse({
  orderCode: "LEAFABC123",
  email: "must-not-persist@example.com",
})).toEqual({ orderCode: "LEAFABC123" });
```

The rendered email must contain the literal order code, formatted total and
“đã nhận thanh toán”. The handler integration test inserts an order, invokes
the real handler with a fake Mailer and asserts the customer-facing send result.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
npx vitest run src/jobs/queue.test.ts src/emails/payment-confirmed.test.tsx src/jobs/handlers/send-payment-confirmed.integration.test.ts
```

Expected: FAIL on missing exports/files.

- [ ] **Step 3: Implement queue, template and handler**

Reuse the existing email retry options. `enqueuePaymentConfirmed` must call:

```ts
const jobId = await bossInstance.send(QUEUE_SEND_PAYMENT_CONFIRMED, data, {
  db: fromPrisma(tx),
});
if (!jobId) throw new Error("Ghi job xác nhận thanh toán thất bại.");
```

The handler loads the order and items by `orderCode`; the job itself contains
no email/address/phone. Payment-confirmation sends use Resend request option
`{ idempotencyKey: "payment-confirmed:<orderCode>" }`; order-confirmation
behavior is unchanged. The worker registration must iterate all jobs and
rethrow handler errors after a non-PII log.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npx vitest run src/jobs/queue.test.ts src/jobs/queue.integration.test.ts src/emails/payment-confirmed.test.tsx src/jobs/handlers/send-payment-confirmed.integration.test.ts src/worker/index.test.ts src/jobs/worker.integration.test.ts
```

Expected: PASS, including real pg-boss transactional enqueue.

- [ ] **Step 5: Commit**

```bash
git add src/jobs src/emails src/worker
git commit -m "feat(payments): send payment confirmation emails"
```

---

### Task 4: Confirm a pending order paid atomically

**Files:**
- Create: `src/server/payments/mark-order-paid.ts`
- Create: `src/server/payments/mark-order-paid.integration.test.ts`

**Interfaces:**
- Produces: `PaymentBusinessError` with codes `ORDER_NOT_FOUND`, `AMOUNT_MISMATCH`, `ORDER_NOT_PENDING`, and `INSUFFICIENT_STOCK`.
- Produces:

```ts
type MarkOrderPaidInput = {
  orderId: string;
  provider: "sepay" | "manual";
  transactionId: string;
  amount: number;
  bankTransactionId?: string;
};

type MarkOrderPaidResult =
  | { kind: "paid"; orderCode: string }
  | { kind: "duplicate"; orderCode: string };

markOrderPaidCore(db, input, deps?): Promise<MarkOrderPaidResult>
markOrderPaidManuallyCore(db, orderId, deps?): Promise<MarkOrderPaidResult>
```

- [ ] **Step 1: Write failing happy-path and rollback tests**

Create an order with two items and assert one call:

- sets `PAID` and `paidAt`;
- decrements each variant by exact quantity;
- creates one `Payment`;
- updates the optional `BankTransaction` to `MATCHED`;
- calls injected enqueue once inside the transaction.

Add a test where enqueue throws and assert order, stock, payment and bank-event
match state all roll back.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run src/server/payments/mark-order-paid.integration.test.ts`

Expected: FAIL because the payment primitive is absent.

- [ ] **Step 3: Implement the transaction**

Within `db.$transaction`:

```ts
const duplicate = await tx.payment.findUnique({ where: { transactionId } });
if (duplicate) return { kind: "duplicate", orderCode: duplicateOrderCode };

const claimed = await tx.order.updateMany({
  where: { id: input.orderId, status: OrderStatus.PENDING_PAYMENT },
  data: { status: OrderStatus.PAID, paidAt: now },
});
if (claimed.count !== 1) throw new PaymentBusinessError("ORDER_NOT_PENDING");

for (const item of aggregateByVariantIdAndSortAscending(order.items)) {
  const decremented = await tx.variant.updateMany({
    where: { id: item.variantId, stock: { gte: item.quantity } },
    data: { stock: { decrement: item.quantity } },
  });
  if (decremented.count !== 1) {
    throw new PaymentBusinessError("INSUFFICIENT_STOCK");
  }
}
```

Enforce exact integer amount against `order.total` before claiming. When a
bank event is present, first conditionally claim it by exact event ID,
`providerTransactionId === transactionId`, and `status === RECEIVED`; require
one row. Aggregate quantity by `variantId` and process IDs in ascending order
to keep row-lock acquisition consistent. Create `Payment`, mark the claimed
`BankTransaction` matched, then enqueue. Do not catch infrastructure errors.
`markOrderPaidManuallyCore` loads the immutable order total from DB and calls
the same transactional path with
`provider="manual"` and `transactionId="manual:<orderId>"`.

If a concurrent attempt loses the conditional order claim, re-query by the
same `transactionId` after the failed transaction has rolled back. Return
`duplicate` only when that exact payment now exists; a different payment for
the same order remains `ORDER_NOT_PENDING`.

- [ ] **Step 4: Add idempotency and race tests**

Add:

- repeated manual ID returns `duplicate`, one decrement and one job;
- two concurrent calls for different orders sharing the last unit result in
  one paid order and stock `0`, never `-1`;
- two different transaction IDs for one order result in one paid order;
- insufficient stock and amount mismatch make no partial changes.
- a concurrent terminal bank-event transition wins cleanly, rolls back every
  payment side effect, and is classified from the persisted winner state;
- deterministic row-lock/barrier tests prove both payment-versus-expiry
  winners and exact job counts.

Run the file until all cases pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/payments/mark-order-paid.ts src/server/payments/mark-order-paid.integration.test.ts
git commit -m "feat(payments): mark orders paid atomically"
```

---

### Task 5: Reconcile SePay events through the webhook route

**Files:**
- Create: `src/server/payments/reconcile-sepay.ts`
- Create: `src/server/payments/reconcile-sepay.integration.test.ts`
- Create: `src/app/api/webhooks/sepay/route.ts`
- Create: `src/app/api/webhooks/sepay/route.test.ts`

**Interfaces:**
- Consumes: Task 1 `BankTransaction`, Task 2 payload/HMAC, Task 4 `markOrderPaidCore`.
- Produces:

```ts
type ReconcileResult =
  | { kind: "matched" }
  | { kind: "duplicate" }
  | { kind: "review-required"; reason: ReviewReason };

persistSePayEventCore(db, payload, rawPayload): Promise<BankTransaction>
reconcilePersistedSePayEventCore(db, eventId, deps?): Promise<ReconcileResult>
reconcileSePayCore(db, payload, deps?): Promise<ReconcileResult>
```

- [ ] **Step 1: Write failing reconciliation tests**

Cover exact code+amount, no code, unknown order, amount mismatch, order no
longer pending, and insufficient stock. Each accepted inbound
event must exist in `bank_transaction`; mismatch must not create `Payment`,
change order, decrement stock or enqueue.

For duplicate `RECEIVED`, call reconciliation again with changed request
code/amount and prove it resumes from the original persisted event. For
duplicate terminal events, prove it returns without side effects. Add
simultaneous duplicate coverage and prove unknown provider fields survive in
stored `rawPayload`.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run src/server/payments/reconcile-sepay.integration.test.ts`

Expected: FAIL because reconciler is absent.

- [ ] **Step 3: Implement persist-then-reconcile**

Insert the event first with canonical `paymentCode`, canonical amount/IDs, and
the original parsed JSON object (not Zod's stripped object). Catch only Prisma
unique conflict `P2002`, then load the existing event. Reconcile `RECEIVED`
rows only from persisted columns and never from a later request body.

Use stable reason strings:

```ts
type ReviewReason =
  | "MISSING_ORDER_CODE"
  | "ORDER_NOT_FOUND"
  | "AMOUNT_MISMATCH"
  | "ORDER_NOT_PENDING"
  | "INSUFFICIENT_STOCK";
```

Known business mismatch updates a still-`RECEIVED` event to
`REVIEW_REQUIRED`. On `markOrderPaidCore` business failure, first allow its
transaction to roll back, reload event status, and only mark review when it
is still `RECEIVED`. Rethrow DB/queue failures so retry remains possible.

- [ ] **Step 4: Write failing Route Handler tests**

Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
and `node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md`.

Mock only the external DB/queue boundary. Assert:

- invalid/missing signature → 401 and core not called;
- malformed JSON/schema/account mismatch → 400;
- valid matched, duplicate and review results → exact HTTP 200 body;
- infrastructure error → 500 generic body;
- signature is calculated from the exact raw request bytes.
- valid input persists before `getBoss()`; queue warm-up failure leaves exactly
  one durable `RECEIVED` event;
- terminal duplicates skip queue warm-up;
- invalid HMAC/schema/account writes no event;
- unknown raw JSON fields are passed to persistence unchanged.

- [ ] **Step 5: Implement the thin route and verify GREEN**

The route must export `runtime = "nodejs"`, call `request.text()` once, validate
HMAC, parse JSON/Zod, compare trimmed `accountNumber` with
`VIETQR_ACCOUNT_NO`, persist/load the event, acknowledge terminal duplicates,
then warm `getBoss()` before persisted-event reconciliation, and return:

```ts
return Response.json({ success: true }, { status: 200 });
```

Run:

```bash
npx vitest run src/lib/sepay.test.ts src/server/payments/reconcile-sepay.integration.test.ts src/app/api/webhooks/sepay/route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/payments/reconcile-sepay.ts src/server/payments/reconcile-sepay.integration.test.ts src/app/api/webhooks/sepay
git commit -m "feat(payments): reconcile SePay webhooks"
```

---

### Task 6: Add owner-only manual confirmation and safe variant deletion errors

**Files:**
- Create: `src/server/actions/payments.ts`
- Create: `src/server/actions/payments.authz.test.ts`
- Create: `src/components/admin/confirm-payment-button.tsx`
- Create: `src/components/admin/confirm-payment-button.test.tsx`
- Create: `src/app/admin/orders/pending/page.tsx`
- Modify: `src/server/products.ts`
- Modify: `src/server/products.integration.test.ts`
- Modify: `src/server/actions/products.ts`

**Interfaces:**
- Consumes: `markOrderPaidCore`.
- Produces: `confirmPaymentManuallyAction(orderId): Promise<{ ok: true } | { ok: false; error: string }>`.
- Produces: a minimal admin pending-orders page with an owner-only action.

- [ ] **Step 1: Write failing action authorization tests**

Mock auth boundary and core. Assert anonymous is rejected by `requireAdmin`,
`staff` is redirected/refused before core, malformed IDs return a validation
error, and `owner` passes only the trusted `orderId`. The action must warm
`getBoss()` before opening the payment transaction.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run src/server/actions/payments.authz.test.ts`

Expected: FAIL because the action is absent.

- [ ] **Step 3: Implement action and minimal UI**

Use `session.user.role === "owner"` as the explicit sensitive-operation gate.
Call `markOrderPaidManuallyCore(prisma, orderId)`; the core, not the client,
loads and verifies the total. Return safe Vietnamese business errors, generic
text for infrastructure failures, and revalidate `/admin/orders/pending` plus
the public order path.

The page calls `requireAdmin()` itself, renders only pending order code,
created time and total, and shows the button only to owner.

- [ ] **Step 4: Write the variant FK regression test**

Create product/variant/order item, omit that variant from update input, and
assert `updateProductCore` rejects with:

```text
Không thể xoá phân loại đã phát sinh đơn hàng. Hãy đặt tồn kho về 0.
```

Also assert the product update transaction rolled back.

- [ ] **Step 5: Implement the safe business error and verify GREEN**

Catch only the Prisma foreign-key error caused by stale-variant `deleteMany`;
do not expose the raw Prisma message. Update the Server Action to return this
business error instead of crashing.

Run:

```bash
npx vitest run src/server/actions/payments.authz.test.ts src/components/admin/confirm-payment-button.test.tsx src/server/products.integration.test.ts src/server/actions/products.authz.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/actions/payments.ts src/server/actions/payments.authz.test.ts src/components/admin/confirm-payment-button.tsx src/components/admin/confirm-payment-button.test.tsx src/app/admin/orders/pending/page.tsx src/server/products.ts src/server/products.integration.test.ts src/server/actions/products.ts
git commit -m "feat(admin): confirm payments manually"
```

---

### Task 7: Expire unpaid orders on a worker schedule

**Files:**
- Modify: `src/jobs/queue.ts`
- Modify: `src/jobs/queue.test.ts`
- Modify: `src/jobs/queue.integration.test.ts`
- Create: `src/jobs/handlers/expire-unpaid.ts`
- Create: `src/jobs/handlers/expire-unpaid.integration.test.ts`
- Modify: `src/worker/index.ts`
- Modify: `src/worker/index.test.ts`
- Modify: `src/jobs/worker.integration.test.ts`

**Interfaces:**
- Produces: `QUEUE_EXPIRE_UNPAID = "expire-unpaid"`.
- Produces: `expireUnpaidOrders({ db }, { now?, maxAgeHours? }): Promise<number>`.
- Produces: `ensureSchedules(boss)` using cron `*/15 * * * *`, `tz: "UTC"`, key `expire-unpaid-15m`.
- Produces: `registerExpireUnpaidWorker(boss, deps)`.

- [ ] **Step 1: Write failing expiry tests**

With injected `now = 2026-07-25T12:00:00.000Z`, assert:

- a pending order created before `2026-07-24T12:00:00.000Z` expires;
- exactly-at-cutoff and newer pending orders stay pending;
- paid/cancelled orders never change;
- repeated execution returns `0` the second time.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run src/jobs/handlers/expire-unpaid.integration.test.ts`

Expected: FAIL because handler is absent.

- [ ] **Step 3: Implement conditional batch expiry**

Use one `updateMany`:

```ts
where: {
  status: OrderStatus.PENDING_PAYMENT,
  createdAt: { lt: cutoff },
},
data: { status: OrderStatus.EXPIRED },
```

Return `result.count`. Never touch stock.

- [ ] **Step 4: Add queue/schedule/worker tests and implementation**

Use the installed pg-boss signature:

```ts
await boss.schedule(
  QUEUE_EXPIRE_UNPAID,
  "*/15 * * * *",
  {},
  { tz: "UTC", key: "expire-unpaid-15m" },
);
```

Ensure the queue exists before scheduling. Call `ensureSchedules` only from
the worker process, not the app-side singleton where `schedule:false`.
Registration remains batch-safe and logs no customer data.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
npx vitest run src/jobs/handlers/expire-unpaid.integration.test.ts src/jobs/queue.test.ts src/jobs/queue.integration.test.ts src/worker/index.test.ts src/jobs/worker.integration.test.ts
```

Expected: PASS.

```bash
git add src/jobs src/worker
git commit -m "feat(orders): expire unpaid orders"
```

---

### Task 8: Expose payment state and prove the end-to-end flow

**Files:**
- Modify: `src/app/orders/[orderCode]/page.tsx`
- Create: `src/app/orders/[orderCode]/page.test.tsx`
- Modify: `e2e/checkout.spec.ts`
- Modify: `README.md`
- Modify: `docs/04-payment-checkout-flow.md`
- Modify: `docs/06-plan-10-days.md`

**Interfaces:**
- Consumes: webhook route and persisted order status.
- Produces: `data-testid="order-status"` with the database-backed status.
- Produces: `data-total="<integer VND>"` on the already-public order total.
- Preserves: existing QR and transfer instructions only for pending orders.

- [ ] **Step 1: Write failing page behavior tests**

Read the local Next.js page/dynamic-route docs. Mock only Prisma and VietQR
external boundaries. Assert:

- pending shows “Chờ thanh toán” and QR;
- paid shows “Đã thanh toán” and no QR/transfer instruction;
- fulfilled/completed use the paid presentation;
- expired/cancelled show inactive text and no QR.

- [ ] **Step 2: Run and verify RED**

Run: `npx vitest run 'src/app/orders/[orderCode]/page.test.tsx'`

Expected: FAIL because the page hardcodes pending state.

- [ ] **Step 3: Implement status-aware rendering and verify GREEN**

Keep `dynamic = "force-dynamic"`. Use an exhaustive status mapping and render
the QR section only for `PENDING_PAYMENT`. Add `data-testid="order-status"`
around the displayed Vietnamese label.

Run the page test and existing checkout component tests.

- [ ] **Step 4: Extend Playwright to simulate the signed webhook**

After guest checkout:

1. read `orderCode` and the literal integer from a `data-total` attribute on
   the already-public displayed order total;
2. construct an official-shape SePay payload with a unique numeric `id`;
3. sign exact `JSON.stringify(payload)` with `SEPAY_WEBHOOK_SECRET`;
4. POST `/api/webhooks/sepay`;
5. expect `{ success: true }`;
6. reload the order page;
7. expect `order-status` to be “Đã thanh toán” and QR absent.

Do not start the email worker in Playwright; the route only needs pg-boss to
enqueue transactionally.

- [ ] **Step 5: Update operational documentation**

Document:

- required `SEPAY_WEBHOOK_SECRET`;
- HMAC headers and exact 200 response;
- worker now handles both email queues plus expiry schedule;
- Day 7 uses `payload.id`, not a fictional `transactionId`;
- unmatched transactions are persisted for Day 8 review.

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
npx prisma generate
npm run lint
npm run test
npm run build
npm run test:e2e
git diff --check
```

Expected: all commands pass. The known Turbopack NFT trace warning may remain,
but no new warning or error is introduced by Day 7.

- [ ] **Step 7: Commit**

```bash
git add src/app/orders e2e/checkout.spec.ts README.md docs/04-payment-checkout-flow.md docs/06-plan-10-days.md
git commit -m "feat(payments): expose paid order status"
```
