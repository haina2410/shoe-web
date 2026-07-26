# Day 7 final-review fix report

## Result and commit

- Base reviewed commit: `403577e58d4daa9502f596dc2e3bd824a3f9bf2f`.
- Green implementation commit: `14804b59d8879055ddf825109bff6d4ef06c6335`
  (`fix: harden day 7 payment flow`).
- This report is committed separately so it can truthfully contain the immutable
  implementation SHA; the report commit SHA is included in the final handoff.
- The ignored real `.env` was not edited. The email worker was not started.

All eight final-review findings are addressed. The final suite passes 412
Vitest tests and 6 Playwright tests.

## Finding-to-change/test map

### 1. Official SePay contract and contiguous order codes

- `src/lib/order-code.ts` now generates `LEAF` plus exactly six uppercase
  alphanumeric characters, with the canonical regex
  `^LEAF[A-Z0-9]{6}$` protected by `src/lib/order-code.test.ts`.
- `src/lib/sepay.ts` accepts empty `description` and `referenceCode`, strictly
  validates `transactionDate` as `YYYY-MM-DD HH:mm:ss`, round-trips the
  components to reject impossible dates, maps Vietnam local time with `+07:00`,
  and returns only canonical payment codes.
- `src/lib/sepay.test.ts` covers the complete official payload, empty official
  fields, malformed formats, February 30, a valid leap date, and malformed
  payment codes.
- QR, checkout, order lookup, email, admin, and integration fixtures were
  changed to the contiguous code in `src/lib/vietqr.test.ts`,
  `src/server/actions/checkout.test.ts`, `src/server/orders.integration.test.ts`,
  page/component tests, and email tests.
- `src/jobs/queue.ts` now rejects non-canonical order-code job payloads;
  `src/jobs/queue.test.ts` protects both mail queues.

### 2. Admin stock optimistic concurrency

- `src/lib/validation/product.ts` requires `expectedStock` for quick edits and
  for every existing variant in a full edit.
- `src/components/admin/product-form.tsx` snapshots the original stock;
  `src/components/admin/stock-quick-edit.tsx` keeps and advances its last
  successful expected value.
- `src/server/actions/products.ts` maps safe product business errors without
  leaking Prisma details.
- `src/server/products.ts` performs conditional `updateMany` compare-and-swap
  writes. A mismatch throws the safe `STALE_STOCK` business error; the full
  product transaction rolls back.
- Validation, component, action, and database coverage lives in
  `src/lib/validation/product.test.ts`,
  `src/components/admin/product-form.test.tsx`,
  `src/components/admin/stock-quick-edit.test.tsx`,
  `src/server/actions/products.authz.test.ts`, and
  `src/server/products.integration.test.ts`.
- The integration tests snapshot admin stock, run the real payment core to
  decrement it, and prove that both stale full-form and quick edits fail without
  restoring the sold unit.

### 3. Persisted bank event as the retry source

- `prisma/schema.prisma` and migration
  `prisma/migrations/20260726153000_day7_final_provider_contract/migration.sql`
  add nullable `BankTransaction.paymentCode`.
- `src/server/payments/reconcile-sepay.ts` separates durable persistence from
  persisted-event reconciliation. It stores the validated code and uses only
  persisted columns on every retry; a later duplicate body cannot change the
  order or amount being reconciled.
- `src/app/api/webhooks/sepay/route.ts` verifies HMAC/schema/account first,
  persists the original parsed JSON before queue warm-up, returns early for
  terminal duplicates, then reconciles by the persisted event ID.
- `src/server/payments/mark-order-paid.ts` conditionally claims the exact bank
  event ID/provider transaction/status inside the payment transaction. A lost
  claim rolls back order, stock, Payment, and job effects and is classified from
  the persisted winner.
- Coverage is in `src/app/api/webhooks/sepay/route.test.ts`,
  `src/app/api/webhooks/sepay/route.integration.test.ts`,
  `src/server/payments/reconcile-sepay.integration.test.ts`, and
  `src/server/payments/mark-order-paid.integration.test.ts`.
- Tests prove tampered duplicate bodies cannot hijack retries, simultaneous
  duplicates have one winner, terminal states are not overwritten, queue
  warm-up failure leaves exactly one `RECEIVED` row, unknown provider fields
  remain in `rawPayload`, and invalid HMAC/schema/account writes zero rows.

### 4. Manual-payment log sanitization

- `src/server/actions/payments.ts` logs only the stable operation/category
  string for infrastructure failures.
- `src/server/actions/payments.authz.test.ts` checks every logged argument and
  proves error-message, secret, email, phone, and bank-account sentinels are
  absent.

### 5. Resend provider idempotency

- `src/lib/mailer.ts` adds optional `MailMessage.idempotencyKey` and passes it
  through the installed Resend SDK's second request-options argument.
- `src/jobs/handlers/send-payment-confirmed.ts` uses the stable non-PII key
  `payment-confirmed:<orderCode>`.
- `src/lib/mailer.test.ts` and
  `src/jobs/handlers/send-payment-confirmed.integration.test.ts` protect the
  provider call contract. Order-confirmation behavior remains unchanged and is
  covered by `src/jobs/handlers/send-order-confirmation.integration.test.ts`.

### 6. Payment-versus-expiry race

- `src/jobs/handlers/expire-unpaid.integration.test.ts` uses real PostgreSQL row
  locks, explicit deferred barriers, and real transactional pg-boss enqueueing.
- Expiry-first proves `EXPIRED` plus zero Payment, stock decrement, or
  confirmation job.
- Payment-first proves `PAID` plus exactly one Payment, one decrement, and one
  confirmation job while expiry updates zero rows.
- Production transaction behavior was already correct; these deterministic
  characterization tests required no production change.

### 7. Consistent stock lock order

- `src/server/payments/mark-order-paid.ts` aggregates duplicate line quantities
  by `variantId` and processes the aggregate in ascending ID order.
- `src/server/payments/mark-order-paid.test.ts` protects both aggregation and
  order. Existing database tests continue to protect rollback and insufficient
  stock behavior.

### 8. Documentation, migration, and fixture sweep

- `.env.example`, `README.md`, `docs/03-data-model.md`,
  `docs/04-payment-checkout-flow.md`, `docs/06-plan-10-days.md`, the Day 5
  checkout plan, and the Day 7 design/implementation documents now describe
  the contiguous code, official payload fields, HMAC verification, persist-first
  ordering, canonical retries, event claim, Resend idempotency, and SePay
  configuration (prefix `LEAF`, six alphanumeric suffix characters).
- The only remaining `LEAF-` occurrences are the deliberate legacy-pattern
  match and replacement in the migration.
- The temporary focused `vitest.unit.config.ts` was removed before commit.

## Witnessed TDD evidence

The behavior changes followed RED, minimal implementation, then focused GREEN:

| Finding | RED witnessed | Focused GREEN witnessed |
| --- | --- | --- |
| SePay/canonical contract | New generator/schema/date/code assertions failed against the old hyphen generator and permissive/over-strict provider schema. | Affected seven-file suite: 85 tests passed. |
| Product stock CAS | 2 deterministic payment-versus-stale-admin tests failed because both stale writes restored sold stock. | `npx vitest run` over validation, form, quick edit, action, and product integration tests: 5 files / 55 tests passed. |
| Persisted event/retry | 2 tests showed retry using later body fields; 1 showed a terminal event overwritten; 1 showed the concurrent terminal winner bubbling; route ordering/raw-payload additions initially produced 9 expected failures. | Reconciliation/route/payment suite: 4 files / 39 tests passed; route database integration: 4/4 passed. |
| Sanitized logs | 2 sentinel tests exposed secret/PII through dependency error messages. | Payment action suite: 13/13 passed. |
| Resend idempotency | 2 tests failed because the provider options/key were absent. | Mailer and both mail-handler suites: 3 files / 17 tests passed. |
| Expiry race | Both new barrier tests characterized existing production behavior and passed; no behavior change was needed. | Expiry integration suite: 4/4 passed. |
| Stock lock order | Unit test expected 2 sorted aggregate decrements but observed 3 per-line calls. | Mark-paid unit/integration plus expiry integration: 3 files / 14 tests passed. |
| Canonical queue guard | `npx vitest run src/jobs/queue.test.ts`: 8 expected failures because both schemas accepted four malformed examples. | `npx vitest run src/jobs/queue.test.ts src/jobs/queue.integration.test.ts`: 2 files / 36 tests passed. |

The first full-suite run then caught one mechanically rewritten malformed fixture
that had accidentally become valid (`LEAFABC123` in a rejection table):
54 files passed, 1 file failed, 411 passed / 1 failed. Replacing that fixture
with a genuinely malformed no-hyphen value made the focused SePay suite 26/26
and the full suite 412/412.

## Migration behavior proof

`20260726153000_day7_final_provider_contract`:

1. adds nullable `bank_transaction.paymentCode`, leaving existing events null;
2. rewrites only legacy values matching `^LEAF-[A-Z0-9]{6}$`;
3. changes only the unique provider/display key, not immutable order IDs, so
   foreign-key relationships remain attached;
4. retains the existing unique index, so an unexpected collision fails
   atomically instead of weakening uniqueness.

An isolated temporary PostgreSQL database received the first five migration SQL
files, a legacy order plus linked bank event and unknown raw field, and then the
new migration. The exact proof query returned:

```text
LEAFABC123|proof-order|t|preserved|t
```

This proves the contiguous code, preserved bank-event/order relationship,
nullable legacy `paymentCode`, preserved raw unknown field, and retained unique
index. The explicitly named temporary database was dropped afterward.

## Full verification

| Command | Result |
| --- | --- |
| `npx prisma generate` | PASS — Prisma Client 7.9.0 generated. |
| `npx prisma migrate deploy` | PASS — 6 migrations found; final provider-contract migration applied successfully to the configured development database. |
| `npm run lint` | PASS; a final post-review lint run also passed. |
| `npm run test` | PASS — 55 files, 412 tests. |
| `npm run build` | PASS — compiled, TypeScript completed, 12/12 static pages generated. The first sandboxed attempt could not reach Google Fonts; the required network-enabled retry passed. |
| `SEPAY_WEBHOOK_SECRET=e2e-test-secret npm run test:e2e` | PASS — 6/6 Playwright tests in 11.3 seconds. |
| `git diff --check` | PASS with no output; final post-review check also passed. |

The pre-existing worktree-root, upload NFT trace, and Playwright color warnings
appeared unchanged and are explicitly nonblocking under the brief.

## Self-review and unresolved concerns

- Reviewed the complete critical source diff for webhook ordering, persisted
  retry inputs, exact bank-event claim predicates, transactional rollback,
  product CAS, provider idempotency, safe logging, and sorted aggregate locks.
- Confirmed the canonical sweep with ripgrep: outside the approved brief, only
  the migration's intentional legacy `LEAF-` regex/replacement remains.
- Confirmed no temporary config was committed, no email worker was started, and
  no real ignored environment file was changed.
- No unresolved functional concern remains. The catalog `createdAt` tie and the
  three unchanged build/E2E warnings above remain the documented, pre-existing,
  nonblocking observations.
