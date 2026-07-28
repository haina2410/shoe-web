# Day 8 Admin Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the small-shop admin workflow for listing and processing orders, manually matching reviewed SePay transactions, and recording bounded multi-entry refunds without changing stock.

**Architecture:** Keep order lifecycle, payment settlement, and refund ledger as separate domain units. Server Actions authenticate and validate only; Postgres-backed cores re-read trusted state and serialize competing mutations by locking the order row. Server Components query fresh admin data, while small Client Components own pending/error states for mutations.

**Tech Stack:** Next.js 16.2.11 App Router, React 19 Server Actions, TypeScript strict, Prisma 7/PostgreSQL, Better Auth RBAC, pg-boss, Zod 4, Vitest, Testing Library, Playwright.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-28-day8-admin-orders-design.md` exactly.
- Read the relevant bundled Next.js 16 guides in `node_modules/next/dist/docs/` before changing pages or Server Actions; `params` and `searchParams` are Promises.
- Use strict red-green-refactor TDD: every production behavior starts with a test that is observed failing for the intended reason.
- Both `owner` and `staff` may confirm payment, match reviewed transactions, cancel pending orders, advance fulfillment, and record refunds.
- Order codes remain canonical `^LEAF[A-Z0-9]{6}$` with no hyphen.
- Do not add an `OrderStatus.REFUNDED`; refund state is derived from immutable `Payment` rows with `direction = OUT`.
- Multiple partial `OUT` rows are allowed, but cumulative `OUT` must never exceed cumulative `IN`.
- Refunds update `Order.lastRefundAt` atomically but never change order status or stock.
- A fully refunded `PAID` order cannot transition to `FULFILLED`.
- Server Actions accept identifiers and requested changes only, then re-read trusted amounts/statuses from the database.
- Logs and action errors must not expose email, phone, address, account number, raw bank payload, tokens, or infrastructure exception text.
- Do not add a workflow engine, shipping integration, automatic bank refund, refund email, CSV export, or complex pagination.

---

## File Map

### Domain and persistence

- Modify `prisma/schema.prisma` — payment direction/audit fields and `Order.lastRefundAt`.
- Create `prisma/migrations/20260728090000_day8_order_operations/migration.sql` — deterministic Day 8 schema migration.
- Create `src/lib/payment-ledger.ts` — pure IN/OUT summary and refund-state derivation.
- Create `src/lib/order-status.ts` — Vietnamese labels and allowed admin transitions.
- Modify `src/server/payments/mark-order-paid.ts` — shared bank-event claim status and actor-aware IN ledger.
- Create `src/server/orders/update-status.ts` — serialized order status transition core.
- Create `src/server/payments/record-refund.ts` — serialized bounded OUT ledger core.
- Create `src/server/payments/match-reviewed-transaction.ts` — safe REVIEW_REQUIRED matching.

### Server boundary

- Modify `src/server/actions/payments.ts` — staff manual confirmation and actor propagation.
- Create `src/server/actions/order-status.ts` — validated status mutation.
- Create `src/server/actions/refunds.ts` — validated refund mutation.
- Create `src/server/actions/bank-transactions.ts` — validated reviewed-event match.
- Create `src/server/queries/admin-orders.ts` — allow-listed filters and admin read models.

### UI

- Create `src/app/admin/orders/page.tsx` — order list and filters.
- Create `src/app/admin/orders/[id]/page.tsx` — order details and payment ledger.
- Modify `src/app/admin/orders/pending/page.tsx` — compatibility redirect.
- Create `src/app/admin/bank-transactions/review/page.tsx` — review queue.
- Modify `src/app/admin/page.tsx` — admin navigation cards.
- Modify `src/components/admin/confirm-payment-button.tsx` — reusable for both roles.
- Create `src/components/admin/order-status-actions.tsx` — cancel/fulfill/complete buttons.
- Create `src/components/admin/refund-form.tsx` — manual OUT form.
- Create `src/components/admin/match-transaction-form.tsx` — manual SePay match form.

### Tests and documentation

- Add colocated unit/component/action tests for every new module above.
- Add Postgres integration tests for status, refund concurrency, and reviewed matching.
- Create `e2e/admin-orders.spec.ts`.
- Modify `README.md`, `docs/03-data-model.md`, `docs/04-payment-checkout-flow.md`, and `docs/06-plan-10-days.md`.

---

### Task 1: Payment Ledger Schema and Pure Domain Rules

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260728090000_day8_order_operations/migration.sql`
- Create: `src/lib/payment-ledger.ts`
- Test: `src/lib/payment-ledger.test.ts`
- Create: `src/lib/order-status.ts`
- Test: `src/lib/order-status.test.ts`
- Modify: `src/test/db.ts` only if reset ordering needs the new relation

**Interfaces:**
- Produces:

```ts
export type RefundState = "NONE" | "PARTIAL" | "FULL";

export type PaymentLedgerSummary = {
  totalIn: number;
  totalOut: number;
  netReceived: number;
  refundState: RefundState;
};

export function summarizePaymentLedger(
  payments: ReadonlyArray<{
    direction: PaymentDirection;
    amount: number;
  }>,
): PaymentLedgerSummary;

export const ORDER_STATUS_LABEL: Record<OrderStatus, string>;
export function canTransitionOrder(
  from: OrderStatus,
  to: OrderStatus,
): boolean;
export function nextOrderStatuses(from: OrderStatus): readonly OrderStatus[];
```

- `canTransitionOrder` represents admin transitions only:

```ts
PENDING_PAYMENT -> CANCELLED
PAID            -> FULFILLED
FULFILLED       -> COMPLETED
```

- `PENDING_PAYMENT -> PAID` remains exclusive to payment settlement and is not returned by `nextOrderStatuses`.

- [ ] **Step 1: Write failing ledger-summary tests**

Create literal, hand-derived cases:

```ts
it.each([
  [[], { totalIn: 0, totalOut: 0, netReceived: 0, refundState: "NONE" }],
  [
    [{ direction: PaymentDirection.IN, amount: 500_000 }],
    { totalIn: 500_000, totalOut: 0, netReceived: 500_000, refundState: "NONE" },
  ],
  [
    [
      { direction: PaymentDirection.IN, amount: 500_000 },
      { direction: PaymentDirection.OUT, amount: 100_000 },
      { direction: PaymentDirection.OUT, amount: 50_000 },
    ],
    { totalIn: 500_000, totalOut: 150_000, netReceived: 350_000, refundState: "PARTIAL" },
  ],
  [
    [
      { direction: PaymentDirection.IN, amount: 500_000 },
      { direction: PaymentDirection.OUT, amount: 500_000 },
    ],
    { totalIn: 500_000, totalOut: 500_000, netReceived: 0, refundState: "FULL" },
  ],
])("summarizes literal IN/OUT rows", (payments, expected) => {
  expect(summarizePaymentLedger(payments)).toEqual(expected);
});
```

Also assert the helper throws for non-integer, non-positive amounts and for a ledger whose `OUT` exceeds `IN`; invalid persisted money must not be silently presented as a valid summary.

- [ ] **Step 2: Run the ledger test and verify RED**

Run:

```bash
npx vitest run src/lib/payment-ledger.test.ts
```

Expected: FAIL because `payment-ledger.ts` and `PaymentDirection` do not exist.

- [ ] **Step 3: Add the Prisma enum, fields, relation, indexes, and SQL migration**

Apply this schema shape:

```prisma
enum PaymentDirection {
  IN
  OUT
}

model User {
  // existing fields
  recordedPayments Payment[] @relation("RecordedPayments")
}

model Order {
  // existing fields
  lastRefundAt DateTime?
}

model Payment {
  // existing fields
  direction         PaymentDirection @default(IN)
  externalReference String?
  note              String?
  recordedByUserId  String?
  recordedBy        User?            @relation(
    "RecordedPayments",
    fields: [recordedByUserId],
    references: [id],
    onDelete: SetNull
  )

  @@index([orderId, direction])
  @@index([recordedByUserId])
}
```

The migration must:

```sql
CREATE TYPE "PaymentDirection" AS ENUM ('IN', 'OUT');
ALTER TABLE "order" ADD COLUMN "lastRefundAt" TIMESTAMP(3);
ALTER TABLE "payment"
  ADD COLUMN "direction" "PaymentDirection" NOT NULL DEFAULT 'IN',
  ADD COLUMN "externalReference" TEXT,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "recordedByUserId" TEXT;
CREATE INDEX "payment_orderId_direction_idx"
  ON "payment"("orderId", "direction");
CREATE INDEX "payment_recordedByUserId_idx"
  ON "payment"("recordedByUserId");
ALTER TABLE "payment"
  ADD CONSTRAINT "payment_recordedByUserId_fkey"
  FOREIGN KEY ("recordedByUserId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

Run `npx prisma generate` after schema changes.

- [ ] **Step 4: Implement the minimal ledger summary and verify GREEN**

Implement one pass over rows, validate each amount, compute totals, reject negative net, then derive `NONE | PARTIAL | FULL`.

Run:

```bash
npx vitest run src/lib/payment-ledger.test.ts
npx prisma validate
```

Expected: both PASS.

- [ ] **Step 5: Write failing order-state-machine tests**

Use a literal table covering every pair of `OrderStatus`. Assert only these pairs return true:

```ts
[
  [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED],
  [OrderStatus.PAID, OrderStatus.FULFILLED],
  [OrderStatus.FULFILLED, OrderStatus.COMPLETED],
]
```

Assert labels:

```ts
expect(ORDER_STATUS_LABEL).toEqual({
  PENDING_PAYMENT: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  FULFILLED: "Đang giao",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã huỷ",
  EXPIRED: "Đã hết hạn",
});
```

- [ ] **Step 6: Run the state-machine test and verify RED**

Run:

```bash
npx vitest run src/lib/order-status.test.ts
```

Expected: FAIL because the state-machine module does not exist.

- [ ] **Step 7: Implement the transition map and verify GREEN**

Keep one frozen map keyed by generated Prisma enum values. `nextOrderStatuses` returns the map entry; `canTransitionOrder` checks membership.

Run:

```bash
npx vitest run src/lib/order-status.test.ts src/lib/payment-ledger.test.ts
env DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy
```

Expected: domain tests PASS and migration applies to `leafshoes_test` through the test environment.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260728090000_day8_order_operations src/lib/payment-ledger.ts src/lib/payment-ledger.test.ts src/lib/order-status.ts src/lib/order-status.test.ts src/test/db.ts
git commit -m "feat(orders): add payment ledger and status rules"
```

---

### Task 2: Actor-Aware IN Payments and Staff Manual Confirmation

**Files:**
- Modify: `src/server/payments/mark-order-paid.ts`
- Modify: `src/server/payments/mark-order-paid.test.ts`
- Modify: `src/server/payments/mark-order-paid.integration.test.ts`
- Modify: `src/server/payments/reconcile-sepay.ts`
- Modify: `src/server/payments/reconcile-sepay.integration.test.ts`
- Modify: `src/server/actions/payments.ts`
- Modify: `src/server/actions/payments.authz.test.ts`
- Modify: `src/app/admin/orders/pending/page.tsx`
- Modify: `src/app/admin/orders/pending/page.test.tsx`

**Interfaces:**
- Replace `bankTransactionId?: string` with:

```ts
export type BankTransactionClaim = {
  id: string;
  expectedStatus: BankTransactionStatus;
};

export type MarkOrderPaidInput = {
  orderId: string;
  provider: "sepay" | "manual";
  transactionId: string;
  amount: number;
  bankTransaction?: BankTransactionClaim;
  recordedByUserId?: string;
};
```

- Change manual signature to:

```ts
export function markOrderPaidManuallyCore(
  db: PrismaClient,
  orderId: string,
  recordedByUserId: string,
  deps?: MarkOrderPaidDeps,
): Promise<MarkOrderPaidResult>;
```

- All created settlement payments explicitly set `direction: IN`.
- Automatic SePay uses `recordedByUserId: null`; manual confirmation stores the authenticated admin ID.

- [ ] **Step 1: Add failing payment-core tests**

Extend existing integration assertions:

```ts
expect(sepayPayment).toMatchObject({
  direction: PaymentDirection.IN,
  recordedByUserId: null,
});

expect(manualPayment).toMatchObject({
  direction: PaymentDirection.IN,
  recordedByUserId: admin.id,
});
```

Add a reviewed-claim test proving `expectedStatus: REVIEW_REQUIRED` can claim a reviewed event, while the existing webhook path with `expectedStatus: RECEIVED` cannot overwrite it. Assert successful matching clears `reviewReason`.

- [ ] **Step 2: Run focused payment tests and verify RED**

Run:

```bash
npx vitest run src/server/payments/mark-order-paid.test.ts src/server/payments/mark-order-paid.integration.test.ts
```

Expected: FAIL because input types, direction, actor, and expected claim status are not implemented.

- [ ] **Step 3: Refactor the payment transaction minimally**

Inside the existing transaction:

```ts
if (input.bankTransaction) {
  await tx.bankTransaction.updateMany({
    where: {
      id: input.bankTransaction.id,
      providerTransactionId: input.transactionId,
      status: input.bankTransaction.expectedStatus,
    },
    data: { updatedAt: now },
  });
}

await tx.payment.create({
  data: {
    orderId: order.id,
    provider: input.provider,
    transactionId: input.transactionId,
    amount: input.amount,
    direction: PaymentDirection.IN,
    recordedByUserId: input.recordedByUserId,
  },
});
```

The final bank-event update sets `reviewReason: null`. Preserve all existing duplicate, stock, rollback, and queue behavior.

Update `reconcilePersistedSePayEventCore` to pass:

```ts
bankTransaction: {
  id: event.id,
  expectedStatus: BankTransactionStatus.RECEIVED,
}
```

- [ ] **Step 4: Verify payment-core GREEN**

Run:

```bash
npx vitest run src/server/payments/mark-order-paid.test.ts src/server/payments/mark-order-paid.integration.test.ts src/server/payments/reconcile-sepay.integration.test.ts
```

Expected: PASS with existing Day 7 race and rollback cases intact.

- [ ] **Step 5: Write failing staff authorization tests**

Replace the old “staff redirects” assertion with:

```ts
it("staff can confirm payment and the core receives the authenticated actor", async () => {
  requireAdminMock.mockResolvedValue(sessionWithRole("staff"));

  await expect(confirmPaymentManuallyAction(VALID_ORDER_ID))
    .resolves.toEqual({ ok: true });

  expect(markOrderPaidManuallyCoreMock).toHaveBeenCalledWith(
    prismaMock,
    VALID_ORDER_ID,
    "user-1",
  );
});
```

Change the pending-page staff test to expect the confirmation button for staff and owner.

- [ ] **Step 6: Run action/page tests and verify RED**

Run:

```bash
npx vitest run src/server/actions/payments.authz.test.ts src/app/admin/orders/pending/page.test.tsx
```

Expected: FAIL because staff is still rejected and actor ID is not passed.

- [ ] **Step 7: Allow both admin roles and propagate actor**

Remove the owner-only redirect. Keep `requireAdmin`, CUID validation, queue warm-up, safe errors, and stable PII-free logging. Revalidate:

```ts
revalidatePath("/admin/orders");
revalidatePath(`/admin/orders/${orderId}`);
revalidatePath(`/orders/${result.orderCode}`);
```

Render `ConfirmPaymentButton` for both admin roles on the compatibility pending page until Task 6 replaces it with a redirect.

- [ ] **Step 8: Verify and commit**

Run:

```bash
npx vitest run src/server/actions/payments.authz.test.ts src/app/admin/orders/pending/page.test.tsx src/server/payments/mark-order-paid.integration.test.ts src/server/payments/reconcile-sepay.integration.test.ts
```

Expected: PASS.

```bash
git add src/server/payments/mark-order-paid.ts src/server/payments/mark-order-paid.test.ts src/server/payments/mark-order-paid.integration.test.ts src/server/payments/reconcile-sepay.ts src/server/payments/reconcile-sepay.integration.test.ts src/server/actions/payments.ts src/server/actions/payments.authz.test.ts src/app/admin/orders/pending/page.tsx src/app/admin/orders/pending/page.test.tsx
git commit -m "feat(payments): record admin actors for incoming payments"
```

---

### Task 3: Serialized Order Status Mutations

**Files:**
- Create: `src/server/orders/update-status.ts`
- Test: `src/server/orders/update-status.integration.test.ts`
- Create: `src/server/actions/order-status.ts`
- Test: `src/server/actions/order-status.authz.test.ts`

**Interfaces:**

```ts
export type UpdateOrderStatusErrorCode =
  | "ORDER_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "FULLY_REFUNDED"
  | "STALE_ORDER";

export class UpdateOrderStatusError extends Error {
  constructor(public readonly code: UpdateOrderStatusErrorCode);
}

export async function updateOrderStatusCore(
  db: PrismaClient,
  input: { orderId: string; targetStatus: OrderStatus },
): Promise<{ orderCode: string; status: OrderStatus }>;

export type UpdateOrderStatusActionResult =
  | { ok: true; status: OrderStatus }
  | { ok: false; error: string };

export async function updateOrderStatusAction(
  orderId: string,
  targetStatus: string,
): Promise<UpdateOrderStatusActionResult>;
```

- [ ] **Step 1: Write failing integration tests**

Create fixtures for pending, paid, fulfilled, completed, cancelled, and expired orders. Cover:

```ts
PENDING_PAYMENT -> CANCELLED // pass
PAID -> FULFILLED            // pass when netReceived > 0
FULFILLED -> COMPLETED       // pass
PAID -> COMPLETED            // INVALID_TRANSITION
CANCELLED -> PAID            // INVALID_TRANSITION
PAID -> FULFILLED            // FULLY_REFUNDED when IN = OUT
```

For the full-refund case, create literal `IN 500_000` and `OUT 500_000`. Assert status remains `PAID`.

- [ ] **Step 2: Run the core test and verify RED**

Run:

```bash
npx vitest run src/server/orders/update-status.integration.test.ts
```

Expected: FAIL because the core does not exist.

- [ ] **Step 3: Implement row-locked transition core**

Within `db.$transaction`:

```ts
const locked = await tx.$queryRaw<Array<{ id: string }>>`
  SELECT "id" FROM "order" WHERE "id" = ${input.orderId} FOR UPDATE
`;
```

If no row is returned, throw `ORDER_NOT_FOUND`. Read order status after the lock, check `canTransitionOrder`, and for `PAID → FULFILLED` aggregate payment amounts by direction. Throw `FULLY_REFUNDED` when `totalIn - totalOut <= 0`. Update with:

```ts
await tx.order.updateMany({
  where: { id: order.id, status: order.status },
  data: { status: input.targetStatus },
});
```

Require count `1`; otherwise throw `STALE_ORDER`.

- [ ] **Step 4: Verify core GREEN**

Run:

```bash
npx vitest run src/server/orders/update-status.integration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing Server Action tests**

Test both owner and staff success, invalid CUID, invalid target enum, anonymous rejection before core, safe business messages, no raw infrastructure error, and these exact revalidations:

```ts
revalidatePath("/admin/orders");
revalidatePath(`/admin/orders/${orderId}`);
revalidatePath(`/orders/${orderCode}`);
```

- [ ] **Step 6: Run action tests and verify RED**

Run:

```bash
npx vitest run src/server/actions/order-status.authz.test.ts
```

Expected: FAIL because the action does not exist.

- [ ] **Step 7: Implement the action boundary**

Use `requireAdmin()`, `z.string().trim().cuid()`, and an allow-list of generated `OrderStatus` values. Map core errors to stable Vietnamese messages. Log only:

```text
[orders] operation=update-status category=infrastructure
```

- [ ] **Step 8: Verify and commit**

Run:

```bash
npx vitest run src/lib/order-status.test.ts src/server/orders/update-status.integration.test.ts src/server/actions/order-status.authz.test.ts
```

Expected: PASS.

```bash
git add src/server/orders/update-status.ts src/server/orders/update-status.integration.test.ts src/server/actions/order-status.ts src/server/actions/order-status.authz.test.ts
git commit -m "feat(orders): enforce admin status transitions"
```

---

### Task 4: Bounded Multi-Entry Refund Ledger

**Files:**
- Create: `src/lib/validation/refund.ts`
- Test: `src/lib/validation/refund.test.ts`
- Create: `src/server/payments/record-refund.ts`
- Test: `src/server/payments/record-refund.integration.test.ts`
- Create: `src/server/actions/refunds.ts`
- Test: `src/server/actions/refunds.authz.test.ts`

**Interfaces:**

```ts
export const refundInputSchema = z.object({
  orderId: z.string().trim().cuid(),
  amount: z.number().int().positive(),
  externalReference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});

export type RecordRefundErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_REFUNDABLE"
  | "NO_INCOMING_PAYMENT"
  | "REFUND_EXCEEDS_RECEIVED";

export async function recordRefundCore(
  db: PrismaClient,
  input: {
    orderId: string;
    amount: number;
    recordedByUserId: string;
    externalReference?: string;
    note?: string;
  },
): Promise<{
  orderCode: string;
  paymentId: string;
  summary: PaymentLedgerSummary;
}>;
```

- [ ] **Step 1: Write failing validation tests**

Assert integer VND amounts pass; `0`, negative, fractional, `NaN`, oversized reference, and oversized note fail. Assert whitespace-only optional strings normalize to `undefined`.

- [ ] **Step 2: Run validation test and verify RED**

Run:

```bash
npx vitest run src/lib/validation/refund.test.ts
```

Expected: FAIL because the schema does not exist.

- [ ] **Step 3: Implement validation and verify GREEN**

Use Zod transforms only for trimming/empty-to-undefined; do not coerce arbitrary strings in the domain schema. The Server Action converts the HTML numeric value before calling `safeParse`.

Run:

```bash
npx vitest run src/lib/validation/refund.test.ts
```

Expected: PASS.

- [ ] **Step 4: Write failing refund integration tests**

Cover:

1. two valid partial refunds create two `OUT` rows, preserve status/stock, and update `lastRefundAt`;
2. exact final refund yields `refundState: "FULL"`;
3. cumulative amount above `IN` rolls back;
4. pending/cancelled/expired orders reject;
5. concurrent refunds of `60_000` against `IN 100_000` result in one success and one `REFUND_EXCEEDS_RECEIVED`, with persisted `OUT = 60_000`;
6. actor, optional reference, note, `provider: "manual"`, and `transactionId` prefix `manual-refund:` persist.

- [ ] **Step 5: Run core tests and verify RED**

Run:

```bash
npx vitest run src/server/payments/record-refund.integration.test.ts
```

Expected: FAIL because the refund core does not exist.

- [ ] **Step 6: Implement serialized refund transaction**

Lock the order row with `FOR UPDATE`, read allowed status, fetch all payment `{direction, amount}`, compute the literal current summary, enforce the cap, then create:

```ts
{
  provider: "manual",
  transactionId: `manual-refund:${crypto.randomUUID()}`,
  amount: input.amount,
  direction: PaymentDirection.OUT,
  externalReference: input.externalReference || null,
  note: input.note || null,
  recordedByUserId: input.recordedByUserId,
  matchedAt: now,
}
```

Update `lastRefundAt: now` in the same transaction. Never touch `Order.status` or `Variant.stock`.

- [ ] **Step 7: Verify core GREEN**

Run:

```bash
npx vitest run src/server/payments/record-refund.integration.test.ts
```

Expected: PASS, including the concurrent cap case.

- [ ] **Step 8: Write failing action tests**

Test both roles, anonymous rejection, validated normalized input, actor propagation, Vietnamese business errors, PII-free infrastructure logging, and list/detail/public revalidation.

- [ ] **Step 9: Implement action, verify, and commit**

The action signature is:

```ts
export async function recordRefundAction(input: {
  orderId: string;
  amount: number;
  externalReference?: string;
  note?: string;
}): Promise<{ ok: true; summary: PaymentLedgerSummary } | {
  ok: false;
  error: string;
}>;
```

Run:

```bash
npx vitest run src/lib/validation/refund.test.ts src/server/payments/record-refund.integration.test.ts src/server/actions/refunds.authz.test.ts
```

Expected: PASS.

```bash
git add src/lib/validation/refund.ts src/lib/validation/refund.test.ts src/server/payments/record-refund.ts src/server/payments/record-refund.integration.test.ts src/server/actions/refunds.ts src/server/actions/refunds.authz.test.ts
git commit -m "feat(payments): record bounded manual refunds"
```

---

### Task 5: Manual Matching for REVIEW_REQUIRED SePay Events

**Files:**
- Create: `src/server/payments/match-reviewed-transaction.ts`
- Test: `src/server/payments/match-reviewed-transaction.integration.test.ts`
- Create: `src/server/actions/bank-transactions.ts`
- Test: `src/server/actions/bank-transactions.authz.test.ts`

**Interfaces:**

```ts
export type MatchReviewedTransactionErrorCode =
  | "EVENT_NOT_FOUND"
  | "EVENT_NOT_REVIEWABLE"
  | "ORDER_NOT_FOUND"
  | "AMOUNT_MISMATCH"
  | "ORDER_NOT_PENDING"
  | "INSUFFICIENT_STOCK";

export async function matchReviewedTransactionCore(
  db: PrismaClient,
  input: {
    bankTransactionId: string;
    orderCode: string;
    recordedByUserId: string;
  },
  deps?: MarkOrderPaidDeps,
): Promise<{ orderId: string; orderCode: string }>;

export async function matchReviewedTransactionAction(input: {
  bankTransactionId: string;
  orderCode: string;
}): Promise<{ ok: true } | { ok: false; error: string }>;
```

- [ ] **Step 1: Write failing integration tests**

Create a `REVIEW_REQUIRED` event with an incorrect/missing parsed code and a separate pending order of the exact amount. Assert manual matching:

- accepts a trimmed, uppercased canonical order code;
- atomically changes event to `MATCHED`, clears `reviewReason`, links `orderId`;
- changes order to `PAID`, decrements stock once;
- creates one `IN` payment using the provider transaction ID and actor;
- enqueues one confirmation;
- leaves event `REVIEW_REQUIRED` and all order/stock/payment state unchanged on amount mismatch, insufficient stock, queue failure, or event race;
- repeated submission does not create another payment or decrement.

- [ ] **Step 2: Run integration test and verify RED**

Run:

```bash
npx vitest run src/server/payments/match-reviewed-transaction.integration.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement reviewed matching through the shared payment core**

Read the event and order to prepare input, but let `markOrderPaidCore` perform the authoritative transaction with:

```ts
{
  orderId: order.id,
  provider: "sepay",
  transactionId: event.providerTransactionId,
  amount: event.amount,
  recordedByUserId: input.recordedByUserId,
  bankTransaction: {
    id: event.id,
    expectedStatus: BankTransactionStatus.REVIEW_REQUIRED,
  },
}
```

Map payment errors without changing `REVIEW_REQUIRED`. Treat an already matched event as a safe duplicate only when its linked order has the requested order code; otherwise return `EVENT_NOT_REVIEWABLE`.

- [ ] **Step 4: Verify core GREEN**

Run:

```bash
npx vitest run src/server/payments/match-reviewed-transaction.integration.test.ts src/server/payments/mark-order-paid.integration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing action tests**

Cover both roles, anonymous rejection, invalid bank transaction CUID, invalid `LEAFXXXXXX` code, queue warm-up before the core, actor propagation, safe error mapping, and revalidation of:

```ts
"/admin/bank-transactions/review"
"/admin/orders"
`/admin/orders/${orderId}`
`/orders/${orderCode}`
```

The core result always returns both `orderId` and `orderCode`, so the action
performs the literal admin-detail and public-order revalidations without a
second lookup.

- [ ] **Step 6: Implement action, verify, and commit**

Use `getBoss()` before opening the payment transaction. Normalize order code with `trim().toUpperCase()` and validate exact `^LEAF[A-Z0-9]{6}$`.

Run:

```bash
npx vitest run src/server/actions/bank-transactions.authz.test.ts src/server/payments/match-reviewed-transaction.integration.test.ts
```

Expected: PASS.

```bash
git add src/server/payments/match-reviewed-transaction.ts src/server/payments/match-reviewed-transaction.integration.test.ts src/server/actions/bank-transactions.ts src/server/actions/bank-transactions.authz.test.ts
git commit -m "feat(payments): match reviewed bank transactions"
```

---

### Task 6: Admin Order Read Models, List, Filters, and Navigation

**Files:**
- Create: `src/server/queries/admin-orders.ts`
- Test: `src/server/queries/admin-orders.test.ts`
- Test: `src/server/queries/admin-orders.integration.test.ts`
- Create: `src/app/admin/orders/page.tsx`
- Test: `src/app/admin/orders/page.test.tsx`
- Modify: `src/app/admin/orders/pending/page.tsx`
- Modify: `src/app/admin/orders/pending/page.test.tsx`
- Modify: `src/app/admin/page.tsx`
- Test: `src/app/admin/page.test.tsx`

**Interfaces:**

```ts
export type AdminOrderFilters = {
  status?: OrderStatus;
  refund: "all" | "with";
  query: string;
};

export function parseAdminOrderFilters(input: {
  status?: string | string[];
  refund?: string | string[];
  query?: string | string[];
}): AdminOrderFilters;

export async function listAdminOrders(
  db: PrismaClient,
  filters: AdminOrderFilters,
): Promise<AdminOrderListItem[]>;
```

`AdminOrderListItem` contains only `id`, `orderCode`, customer name, createdAt, total, status, and the payment fields required by `summarizePaymentLedger`.

- [ ] **Step 1: Write failing parser tests**

Assert:

- only exact generated status values survive;
- `refund=with` survives, every other value becomes `all`;
- array query values are rejected to the default;
- query is trimmed, uppercased, and capped at 32 characters;
- blank query becomes `""`.

- [ ] **Step 2: Run parser tests and verify RED**

Run:

```bash
npx vitest run src/server/queries/admin-orders.test.ts
```

Expected: FAIL because the query module does not exist.

- [ ] **Step 3: Implement parser and Postgres query**

Build Prisma `where` from allow-listed values:

```ts
{
  status: filters.status,
  orderCode: filters.query
    ? { contains: filters.query, mode: "insensitive" }
    : undefined,
  payments: filters.refund === "with"
    ? { some: { direction: PaymentDirection.OUT } }
    : undefined,
}
```

Use `orderBy: { createdAt: "desc" }`, `take: 100`, and select payment direction/amount only.

- [ ] **Step 4: Add integration tests and verify query GREEN**

Insert literal orders with no refund, partial refund, and full refund. Assert status/search/refund filters and newest-first ordering.

Run:

```bash
npx vitest run src/server/queries/admin-orders.test.ts src/server/queries/admin-orders.integration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing list-page tests**

Mock `requireAdmin` and `listAdminOrders`. Pass `searchParams` as `Promise.resolve(...)` and assert:

- Next.js 16 Promise params are awaited;
- selected status/refund/query are reflected in controls;
- rows show Vietnamese status and derived refund badge;
- empty state renders;
- every order code links to `/admin/orders/<id>`;
- `requireAdmin` runs before the query.

- [ ] **Step 6: Run page tests and verify RED**

Run:

```bash
npx vitest run src/app/admin/orders/page.test.tsx
```

Expected: FAIL because the page does not exist.

- [ ] **Step 7: Implement list page and compatible redirect**

Use a GET `<form>` for filters so the URL is shareable. Keep the table server-rendered. Replace the old pending page body with:

```ts
import { redirect } from "next/navigation";

export default function AdminPendingOrdersPage() {
  redirect("/admin/orders?status=PENDING_PAYMENT");
}
```

The redirect test asserts `redirect` receives that exact URL.

Add dashboard cards linking to `/admin/orders` and `/admin/bank-transactions/review`.

- [ ] **Step 8: Verify and commit**

Run:

```bash
npx vitest run src/server/queries/admin-orders.test.ts src/server/queries/admin-orders.integration.test.ts src/app/admin/orders/page.test.tsx src/app/admin/orders/pending/page.test.tsx src/app/admin/page.test.tsx
```

Expected: PASS.

```bash
git add src/server/queries/admin-orders.ts src/server/queries/admin-orders.test.ts src/server/queries/admin-orders.integration.test.ts src/app/admin/orders/page.tsx src/app/admin/orders/page.test.tsx src/app/admin/orders/pending/page.tsx src/app/admin/orders/pending/page.test.tsx src/app/admin/page.tsx src/app/admin/page.test.tsx
git commit -m "feat(admin): add filterable order list"
```

---

### Task 7: Order Detail and Mutation Components

**Files:**
- Modify: `src/server/queries/admin-orders.ts`
- Modify: `src/server/queries/admin-orders.integration.test.ts`
- Create: `src/app/admin/orders/[id]/page.tsx`
- Test: `src/app/admin/orders/[id]/page.test.tsx`
- Modify: `src/components/admin/confirm-payment-button.tsx`
- Modify: `src/components/admin/confirm-payment-button.test.tsx`
- Create: `src/components/admin/order-status-actions.tsx`
- Test: `src/components/admin/order-status-actions.test.tsx`
- Create: `src/components/admin/refund-form.tsx`
- Test: `src/components/admin/refund-form.test.tsx`

**Interfaces:**

```ts
export async function getAdminOrderDetail(
  db: PrismaClient,
  orderId: string,
): Promise<AdminOrderDetail | null>;
```

The detail read model includes items, payments ordered by `matchedAt desc` with actor name/email, and linked bank transactions ordered by `occurredAt desc`.

- [ ] **Step 1: Write failing detail-query integration test**

Assert the read model contains snapshot items, customer/address totals, ordered IN/OUT history, actor, bank transaction, `nextOrderStatuses`, and literal ledger summary.

- [ ] **Step 2: Run query test and verify RED**

Run:

```bash
npx vitest run src/server/queries/admin-orders.integration.test.ts
```

Expected: FAIL because `getAdminOrderDetail` does not exist.

- [ ] **Step 3: Implement the focused detail query**

Use one Prisma `findUnique` with explicit `select`; do not return `rawPayload`. Derive summary and transitions after the query. If summary is `FULL`, remove `FULFILLED` from the returned targets for a `PAID` order.

- [ ] **Step 4: Write failing component tests**

`OrderStatusActions`:

- renders only the supplied allowed targets;
- sends order ID and exact target;
- disables all action buttons during the request;
- blocks double submit;
- renders returned/rejected errors without raw exception text.

`RefundForm`:

- submits numeric amount plus trimmed optional fields;
- disables during request and blocks double submit;
- resets on success;
- renders the returned summary label;
- shows safe returned/rejected errors in `role="alert"`.

`ConfirmPaymentButton` retains the same double-submit/safe-error behavior and is not role-specific.

- [ ] **Step 5: Run component tests and verify RED**

Run:

```bash
npx vitest run src/components/admin/order-status-actions.test.tsx src/components/admin/refund-form.test.tsx src/components/admin/confirm-payment-button.test.tsx
```

Expected: FAIL because the new components do not exist.

- [ ] **Step 6: Implement minimal Client Components**

Use `useTransition` plus an in-flight ref, matching the existing confirmation button pattern. Do not perform optimistic state mutation. Button labels:

```ts
CANCELLED: "Huỷ đơn"
FULFILLED: "Chuyển sang đang giao"
COMPLETED: "Đánh dấu hoàn tất"
```

Refund fields are labeled `Số tiền hoàn`, `Mã giao dịch ngân hàng`, and `Ghi chú`.

- [ ] **Step 7: Verify component GREEN**

Run:

```bash
npx vitest run src/components/admin/order-status-actions.test.tsx src/components/admin/refund-form.test.tsx src/components/admin/confirm-payment-button.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Write failing detail-page tests**

Pass `params: Promise.resolve({ id })`. Assert:

- `requireAdmin` before query;
- `notFound()` on missing order;
- customer, address, items, totals, statuses, actor/reference/note render;
- pending order renders confirmation and cancel;
- paid order renders fulfill and refund;
- full-refund paid order does not render fulfill;
- raw bank JSON and full account number do not render.

- [ ] **Step 9: Implement the detail page**

Await `params`, validate the ID before querying, call `notFound` for invalid/missing IDs, and compose the three small Client Components. Mask account numbers to the final four digits.

- [ ] **Step 10: Verify and commit**

Run:

```bash
npx vitest run src/server/queries/admin-orders.integration.test.ts 'src/app/admin/orders/[id]/page.test.tsx' src/components/admin/order-status-actions.test.tsx src/components/admin/refund-form.test.tsx src/components/admin/confirm-payment-button.test.tsx
```

Expected: PASS.

```bash
git add src/server/queries/admin-orders.ts src/server/queries/admin-orders.integration.test.ts 'src/app/admin/orders/[id]/page.tsx' 'src/app/admin/orders/[id]/page.test.tsx' src/components/admin/confirm-payment-button.tsx src/components/admin/confirm-payment-button.test.tsx src/components/admin/order-status-actions.tsx src/components/admin/order-status-actions.test.tsx src/components/admin/refund-form.tsx src/components/admin/refund-form.test.tsx
git commit -m "feat(admin): add order detail operations"
```

---

### Task 8: Reviewed Transaction Queue UI

**Files:**
- Modify: `src/server/queries/admin-orders.ts`
- Modify: `src/server/queries/admin-orders.integration.test.ts`
- Create: `src/components/admin/match-transaction-form.tsx`
- Test: `src/components/admin/match-transaction-form.test.tsx`
- Create: `src/app/admin/bank-transactions/review/page.tsx`
- Test: `src/app/admin/bank-transactions/review/page.test.tsx`

**Interfaces:**

```ts
export async function listReviewedBankTransactions(
  db: PrismaClient,
): Promise<Array<{
  id: string;
  occurredAt: Date;
  gateway: string;
  maskedAccountNumber: string;
  amount: number;
  content: string;
  paymentCode: string | null;
  reviewReason: string | null;
  reviewReasonLabel: string;
}>>;
```

- [ ] **Step 1: Write failing review-query integration tests**

Insert `RECEIVED`, `MATCHED`, and multiple `REVIEW_REQUIRED` events. Assert only review rows return, oldest first, account numbers are masked before leaving the query boundary, and raw payload is absent.

- [ ] **Step 2: Run query test and verify RED**

Run:

```bash
npx vitest run src/server/queries/admin-orders.integration.test.ts
```

Expected: FAIL because the review query does not exist.

- [ ] **Step 3: Implement the review query**

Use explicit select, `where: { status: REVIEW_REQUIRED }`, `orderBy: { createdAt: "asc" }`, and `take: 100`. Map reasons:

```ts
MISSING_ORDER_CODE: "Không tìm thấy mã đơn trong giao dịch"
ORDER_NOT_FOUND: "Mã đơn không tồn tại"
AMOUNT_MISMATCH: "Số tiền không khớp"
ORDER_NOT_PENDING: "Đơn không còn chờ thanh toán"
INSUFFICIENT_STOCK: "Không đủ tồn kho"
```

Unknown or null persisted reasons map to the fallback label
`"Cần kiểm tra thủ công"`; do not cast arbitrary database strings to the
`ReviewReason` union.

- [ ] **Step 4: Write failing form/page tests**

Form tests assert initial order code uses `paymentCode ?? ""`, normalization is left to the Server Action, double submit is blocked, pending text is shown, and errors are safe.

Page tests assert auth before query, empty state, oldest-first rows, Vietnamese reason, masked account, amount/content, and one match form per event.

- [ ] **Step 5: Run UI tests and verify RED**

Run:

```bash
npx vitest run src/components/admin/match-transaction-form.test.tsx src/app/admin/bank-transactions/review/page.test.tsx
```

Expected: FAIL because UI files do not exist.

- [ ] **Step 6: Implement UI, verify, and commit**

Use an accessible table/card layout. Do not render raw payload. The form has one labeled `Mã đơn` input and button `Ghép giao dịch`.

Run:

```bash
npx vitest run src/server/queries/admin-orders.integration.test.ts src/components/admin/match-transaction-form.test.tsx src/app/admin/bank-transactions/review/page.test.tsx
```

Expected: PASS.

```bash
git add src/server/queries/admin-orders.ts src/server/queries/admin-orders.integration.test.ts src/components/admin/match-transaction-form.tsx src/components/admin/match-transaction-form.test.tsx src/app/admin/bank-transactions/review/page.tsx src/app/admin/bank-transactions/review/page.test.tsx
git commit -m "feat(admin): add reviewed transaction queue"
```

---

### Task 9: Day 8 End-to-End Flows and Documentation

**Files:**
- Create: `e2e/helpers/checkout.ts`
- Modify: `e2e/checkout.spec.ts`
- Create: `e2e/admin-orders.spec.ts`
- Modify: `README.md`
- Modify: `docs/03-data-model.md`
- Modify: `docs/04-payment-checkout-flow.md`
- Modify: `docs/06-plan-10-days.md`

**Interfaces:**

```ts
export async function createPendingOrderViaCheckout(
  page: Page,
  customerSuffix: string,
): Promise<{ orderCode: string; total: number }>;

export async function loginAsStaff(page: Page): Promise<void>;
```

The helper extracts the existing guest checkout behavior without changing its assertions; both E2E specs consume the same user-visible flow.

- [ ] **Step 1: Extract checkout helper with the existing test still GREEN**

Move the repeated browse/cart/checkout steps from `e2e/checkout.spec.ts` into `e2e/helpers/checkout.ts`. Keep webhook assertions in the existing test.

Run:

```bash
SEPAY_WEBHOOK_SECRET=e2e-test-secret npx playwright test e2e/checkout.spec.ts
```

Expected: existing checkout/webhook test PASS before adding Day 8 behavior.

- [ ] **Step 2: Write the staff fulfillment/refund E2E test**

Flow:

1. guest creates a unique pending order;
2. staff logs in with `SEED_STAFF_EMAIL`/`SEED_STAFF_PASSWORD`;
3. opens `/admin/orders`, searches order code, opens detail;
4. confirms payment and sees **Đã thanh toán**;
5. advances to **Đang giao**, then **Hoàn tất**;
6. records `10.000` VND OUT with unique reference;
7. sees **Đã hoàn một phần**, total OUT `10.000 ₫`, and unchanged **Hoàn tất** status.

The test must fail before Day 8 UI is complete if run against the task’s base.

- [ ] **Step 3: Write the reviewed-match E2E test**

Flow:

1. guest creates another pending order;
2. POST a correctly signed SePay event with exact amount but `code: "LEAFFFFFF"` so it becomes `REVIEW_REQUIRED`;
3. staff opens `/admin/bank-transactions/review`;
4. enters the real pending `orderCode` and clicks **Ghép giao dịch**;
5. sees the review row disappear;
6. opens the order and sees **Đã thanh toán**.

Use raw-body signing identical to `e2e/checkout.spec.ts`. Use unique numeric provider IDs.

- [ ] **Step 4: Run Day 8 E2E and fix only test-discovered regressions through TDD**

Run:

```bash
npm run db:seed
SEPAY_WEBHOOK_SECRET=e2e-test-secret npx playwright test e2e/admin-orders.spec.ts e2e/checkout.spec.ts
```

Expected: all selected E2E tests PASS.

- [ ] **Step 5: Update documentation**

Document:

- Payment `IN/OUT`, `lastRefundAt`, partial/full derived refund state;
- staff and owner equal Day 8 order permissions;
- exact order transition matrix and full-refund fulfill guard;
- reviewed transaction matching;
- no automatic stock restoration or bank transfer;
- Day 8 completion in the ten-day plan.

Do not include real credentials, account numbers, webhook secrets, customer data, or local absolute paths.

- [ ] **Step 6: Run full verification**

Run from the feature worktree with PostgreSQL available:

```bash
npx prisma generate
npx prisma migrate deploy
npm run lint
npm run test
npm run build
npm run db:seed
SEPAY_WEBHOOK_SECRET=e2e-test-secret npm run test:e2e
git diff --check
```

Expected:

- Prisma generate/migrate exit `0`;
- ESLint exits `0`;
- all Vitest files/tests pass;
- Next.js production build exits `0`;
- all Playwright tests pass;
- `git diff --check` prints nothing.

The known NFT tracing warning from `src/app/api/uploads/[...path]/route.ts` may remain if unchanged; no new warning/error is accepted.

- [ ] **Step 7: Commit**

```bash
git add e2e/helpers/checkout.ts e2e/checkout.spec.ts e2e/admin-orders.spec.ts README.md docs/03-data-model.md docs/04-payment-checkout-flow.md docs/06-plan-10-days.md
git commit -m "test: verify day 8 admin order flows"
```

---

## Final Review Checklist

- [ ] Every production behavior was introduced by an observed failing test.
- [ ] Existing webhook, stock-decrement, expiry, email enqueue, product, checkout, and storefront tests remain green.
- [ ] Both staff and owner pass every Day 8 authorization test.
- [ ] Payment `IN` migration preserves all existing rows.
- [ ] Concurrent refund tests prove cumulative `OUT <= IN`.
- [ ] Refund tests prove status and stock never change.
- [ ] Full-refund tests prove `PAID → FULFILLED` is blocked.
- [ ] Reviewed-event tests prove failure keeps `REVIEW_REQUIRED`.
- [ ] No admin page returns or renders bank `rawPayload`.
- [ ] No log assertion contains PII or infrastructure exception text.
- [ ] `params`/`searchParams` are awaited according to Next.js 16.
- [ ] Full lint, Vitest, build, seed, and Playwright verification is fresh.
