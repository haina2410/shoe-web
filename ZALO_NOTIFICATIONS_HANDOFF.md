# Temporary Handoff: Zalo Order Notifications

> Remove this file after the feature is implemented and its durable behavior is
> recorded in `docs/`. No feature code has been implemented yet.

## Requested execution split

Run two `gpt-5.6-terra` implementation agents in parallel, each in its existing
worktree:

- `.worktrees/zalo-polling` on `feat/zalo-polling`: direct Bot API client and
  the optional 30-second long-polling chat-ID discovery process.
- `.worktrees/zalo-notifications` on `feat/zalo-notifications`: the initially
  empty hard-coded recipient array, pg-boss order-created jobs, worker delivery,
  Compose/environment wiring, and durable documentation.

Both worktrees currently point to `fe8f5cf`. Bring this handoff commit into each
branch before implementation. Keep their file ownership disjoint; reconcile the
shared Zalo API boundary when integrating the two branches.

Official references:

- `getUpdates`: https://docs.zaloplatforms.com/docs/BOT/apis/getUpdates
- `sendMessage` and Markdown formatting:
  https://docs.zaloplatforms.com/docs/BOT/apis/sendMessage
- Incoming update shape: https://docs.zaloplatforms.com/docs/BOT/webhook

# Zalo Order Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send compact Markdown Zalo alerts to hard-coded owner/staff chat IDs for every newly created order and provide an optional long-polling ID collector.

**Architecture:** A small native-fetch Zalo Bot API client is shared by an optional polling entrypoint and the existing pg-boss worker. Order creation writes one recipient-scoped notification job per configured recipient in its database transaction; the worker loads order data and sends a four-line Markdown alert.

**Tech Stack:** TypeScript, Node 24 native `fetch`, Zod, pg-boss, Prisma, Vitest, Docker Compose.

## Global Constraints

- Use the direct Zalo Bot API with native `fetch`; add neither a Zalo SDK nor Axios.
- Every `getUpdates` request is a POST with JSON body `{ "timeout": 30 }`.
- Every notification `sendMessage` request is a POST with `chat_id`, `text`, and `parse_mode: "markdown"`.
- Keep the order alert to four lines: heading, customer and phone, total and Vietnamese status, admin URL.
- Exclude customer email, delivery address, items, and notes from the alert and from queue payloads.
- Keep recipient chat IDs in code with stable keys; start with an empty recipient list until IDs are collected.
- `BOT_TOKEN` comes only from runtime environment and must never be logged.
- New and changed production code defaults to zero comments under `AGENTS.md`.
- Follow strict red-green-refactor: each behavioral production change starts with a test that is run and observed failing for the expected reason.
- Durable documentation describes current behavior; ignored plan/spec artifacts are not committed.

---

### Task 1: Zalo API client and polling collector

**Files:**
- Create: `src/lib/zalo-bot.ts`
- Create: `src/lib/zalo-bot.test.ts`
- Create: `src/zalo-bot/index.ts`
- Create: `src/zalo-bot/index.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produce `ZaloNotificationRecipient = { key: string; chatId: string }`.
- Produce `ZALO_NOTIFICATION_RECIPIENTS: readonly ZaloNotificationRecipient[]`, initially `[]`.
- Produce `ZaloUpdate` for an API result with `eventName` plus optional text message fields `from.id`, `from.displayName`, `chat.id`, and `text`.
- Produce `ZaloBotClient` with `getUpdates(): Promise<ZaloUpdate | null>` and `sendMessage(input: { chatId: string; text: string; parseMode?: "markdown" | "html" }): Promise<void>`.
- Produce `createZaloBotClient(token: string, fetchImpl?: typeof fetch): ZaloBotClient`.
- Produce `zaloBotClientFromEnv(env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch): ZaloBotClient` that rejects a missing or blank `BOT_TOKEN` without exposing its value.
- Produce `respondToGreeting(client: Pick<ZaloBotClient, "sendMessage">, update: ZaloUpdate): Promise<boolean>`.
- Produce `runPolling(client: ZaloBotClient, signal?: AbortSignal): Promise<void>` and a guarded executable entrypoint.

- [ ] **Step 1: Write failing API-client tests**

Add tests proving `getUpdates` sends POST JSON `{ timeout: 30 }`, maps the official `ok/result/event_name/message/from/chat/text` shape, returns `null` when no result exists, `sendMessage` maps camel-case inputs to the documented payload, and HTTP/API-level failures reject without including the token.

- [ ] **Step 2: Run the API-client test and verify RED**

Run: `npm test -- src/lib/zalo-bot.test.ts`

Expected: FAIL because `@/lib/zalo-bot` does not exist.

- [ ] **Step 3: Implement the minimal API client and recipient configuration**

Use Zod at the response boundary, `Content-Type: application/json`, and endpoint construction rooted at `https://bot-api.zaloplatforms.com/bot${token}`. Reject non-2xx responses and `ok !== true`; never include response bodies or URLs containing the token in error messages.

- [ ] **Step 4: Run the API-client test and verify GREEN**

Run: `npm test -- src/lib/zalo-bot.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing collector tests**

Add table-driven tests proving trimmed case-insensitive exact `hi` and `hello` send `Hello Ted, chat id is 6ede9afa66b88fe6d6a9`, unrelated/non-text updates send nothing, a polling iteration requests another update after ignored messages, and an aborted signal exits the loop.

- [ ] **Step 6: Run the collector test and verify RED**

Run: `npm test -- src/zalo-bot/index.test.ts`

Expected: FAIL because the collector module does not exist.

- [ ] **Step 7: Implement the collector and script**

Implement direct-execution guarding with `pathToFileURL`, graceful SIGINT/SIGTERM abort, and a one-second retry delay after transient poll errors. Add `"zalo-bot": "tsx src/zalo-bot/index.ts"` to `package.json`.

- [ ] **Step 8: Run Task 1 tests and commit**

Run: `npm test -- src/lib/zalo-bot.test.ts src/zalo-bot/index.test.ts`

Expected: PASS.

Commit: `Add Zalo Bot API client and ID collector`

---

### Task 2: Recipient-scoped order jobs and worker delivery

**Files:**
- Modify: `src/jobs/queue.ts`
- Modify: `src/jobs/queue.test.ts`
- Modify: `src/jobs/queue.integration.test.ts`
- Create: `src/jobs/handlers/send-zalo-order-created.ts`
- Create: `src/jobs/handlers/send-zalo-order-created.test.ts`
- Modify: `src/server/orders.ts`
- Modify: `src/server/orders.integration.test.ts`
- Modify: all existing test fixtures that pass `CreateOrderDeps`
- Modify: `src/worker/index.ts`
- Modify: `src/worker/index.test.ts`

**Interfaces:**
- Consume `ZALO_NOTIFICATION_RECIPIENTS`, `ZaloNotificationRecipient`, `ZaloBotClient`, and `zaloBotClientFromEnv` from Task 1.
- Produce `QUEUE_SEND_ZALO_ORDER_CREATED = "send-zalo-order-created"`.
- Produce `zaloOrderCreatedJobSchema` with canonical `orderCode` and non-empty `recipientKey` only.
- Produce `enqueueZaloOrderCreatedNotifications(tx, { orderCode }, boss?, recipients?): Promise<void>`.
- Produce `formatZaloOrderCreatedMessage(order, appBaseUrl): string`.
- Produce `handleSendZaloOrderCreated({ db, bot, recipients? }, payload): Promise<void>`.
- Produce `registerZaloOrderCreatedWorker(boss, { db, bot, recipients? }): Promise<void>`.
- Extend `CreateOrderDeps` with required `enqueueZaloOrderCreatedNotifications` and invoke it after the email enqueue while still inside the order transaction.

- [ ] **Step 1: Write failing queue tests**

Prove queue creation/update includes `send-zalo-order-created`; two configured recipients produce two jobs containing only `{ orderCode, recipientKey }`; an empty list produces no jobs; and a null job ID rejects. Use literal recipient fixtures with stable keys and fake chat IDs.

- [ ] **Step 2: Run queue tests and verify RED**

Run: `npm test -- src/jobs/queue.test.ts`

Expected: FAIL because the Zalo queue symbols do not exist.

- [ ] **Step 3: Implement queue schema and enqueueing**

Apply the existing retry/backoff queue options. Resolve the boss once, loop recipients, write through `fromPrisma(tx)`, and store recipient keys rather than chat IDs.

- [ ] **Step 4: Run queue unit and integration tests and verify GREEN**

Run: `npm test -- src/jobs/queue.test.ts src/jobs/queue.integration.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing message-handler tests**

Prove the exact four-line message structure, Vietnamese VND formatting, Markdown escaping for dynamic customer/order fields, the admin URL `/admin/orders/<order.id>`, omission of email/address/items/notes, recipient-key resolution, and API failure propagation.

- [ ] **Step 6: Run handler tests and verify RED**

Run: `npm test -- src/jobs/handlers/send-zalo-order-created.test.ts`

Expected: FAIL because the handler does not exist.

- [ ] **Step 7: Implement the formatter and handler**

Select only `id`, `orderCode`, `customerName`, `phone`, `total`, and `status` from Prisma. Use `formatVnd`, trim the configured base URL, resolve a stable recipient key, and call `sendMessage` with Markdown parse mode.

- [ ] **Step 8: Write failing order-creation tests**

Extend dependency fakes and prove both email and Zalo enqueue functions receive the created order code. Prove a Zalo enqueue failure rolls back the order transaction and the real pg-boss path creates recipient-scoped jobs atomically.

- [ ] **Step 9: Run order tests and verify RED**

Run: `npm test -- src/server/orders.integration.test.ts`

Expected: FAIL because order creation does not invoke the Zalo dependency.

- [ ] **Step 10: Integrate order creation and update existing fixtures**

Add the required dependency, default both enqueue functions together, call Zalo enqueue after email enqueue, and update every injected test dependency to provide both functions.

- [ ] **Step 11: Write failing worker-registration tests**

Prove registration uses the Zalo queue, handles every job in a batch, logs only queue/job/order identifiers on failure, rethrows for pg-boss retry, and worker environment initialization rejects a missing `BOT_TOKEN`.

- [ ] **Step 12: Run worker tests and verify RED**

Run: `npm test -- src/worker/index.test.ts`

Expected: FAIL because the Zalo worker is not registered.

- [ ] **Step 13: Register Zalo delivery in the worker**

Create the Zalo client once during fail-fast worker startup, register the new worker after queues exist, include the queue name in the readiness message, and do not log customer data or provider error bodies.

- [ ] **Step 14: Run Task 2 tests and commit**

Run: `npm test -- src/jobs/queue.test.ts src/jobs/queue.integration.test.ts src/jobs/handlers/send-zalo-order-created.test.ts src/server/orders.integration.test.ts src/worker/index.test.ts`

Expected: PASS.

Commit: `Notify staff through Zalo for new orders`

---

### Task 3: Conditional Compose service, environment contract, and durable docs

**Files:**
- Modify: `docker-compose.prod.yml`
- Modify: `.env.example`
- Modify: `.env.production.example`
- Modify: `scripts/validate-production-env.mjs`
- Modify: `src/deployment/production-env.test.ts`
- Modify: `docs/01-overview-architecture.md`
- Modify: `docs/02-tech-stack.md`
- Modify: `docs/04-payment-checkout-flow.md`
- Modify: `docs/08-production-runbook.md`

**Interfaces:**
- Consume the existing worker image and `npm run zalo-bot` entrypoint from Task 1.
- Add Compose service `zalo-bot` under profile `zalo-bot`, with only `BOT_TOKEN`, `init: true`, `restart: unless-stopped`, and the worker image/tag/pull policy.
- Add `BOT_TOKEN` to the normal worker environment and production environment validation.

- [ ] **Step 1: Write failing production-environment tests**

Extend the controlled environment fixture so omitting `BOT_TOKEN` reports that variable in stable order and present secret values never appear in CLI output.

- [ ] **Step 2: Run the environment test and verify RED**

Run: `npm test -- src/deployment/production-env.test.ts`

Expected: FAIL because `BOT_TOKEN` is not required yet.

- [ ] **Step 3: Add runtime and Compose configuration**

Require `BOT_TOKEN` in validation and examples. Configure the normal worker with the token. Configure the optional service to run `npm run zalo-bot` from the same worker image without database, mail, VietQR, or app secrets.

- [ ] **Step 4: Validate Compose and environment behavior**

Run: `npm test -- src/deployment/production-env.test.ts`

Run: `env $(awk -F= '/^[A-Z0-9_]+=/ {print $1 "=test"}' .env.production.example | xargs) docker compose -f docker-compose.prod.yml --profile zalo-bot config --quiet`

Expected: both commands exit 0.

- [ ] **Step 5: Update durable documentation**

Document Zalo as an external service, the recipient-scoped queue and compact data boundary, direct Bot API choice, `BOT_TOKEN`, the collector launch command `docker compose -f docker-compose.prod.yml --profile zalo-bot up -d zalo-bot`, the `hi`/`hello` discovery flow, editing the code-owned recipient list, rebuilding/redeploying, and stopping/removing the collector after collection.

- [ ] **Step 6: Verify Markdown links and commit**

Run: `rg -n '\]\([^)]*\.md\)' docs`

Manually confirm every relative Markdown target printed by the command exists.

Commit: `Document Zalo notification operations`

---

### Task 4: Whole-feature verification

**Files:**
- Modify only if verification exposes a defect covered by this plan.

**Interfaces:**
- Consume all prior task outputs.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/lib/zalo-bot.test.ts src/zalo-bot/index.test.ts src/jobs/queue.test.ts src/jobs/queue.integration.test.ts src/jobs/handlers/send-zalo-order-created.test.ts src/server/orders.integration.test.ts src/worker/index.test.ts src/deployment/production-env.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full static and test verification**

Run: `npm run lint`

Run: `npx tsc --noEmit`

Run: `npm test`

Expected: all commands exit 0 without new warnings.

- [ ] **Step 3: Inspect final diff and recipient safety**

Run: `git diff --check`

Run: `git status --short`

Confirm the recipient list is empty, no token value is committed, queue payloads contain no customer data/chat IDs, and only intended files changed.

- [ ] **Step 4: Commit verification fixes if any**

If verification required code changes, commit them as `Fix Zalo notification verification findings`. If no changes were required, do not create an empty commit.
