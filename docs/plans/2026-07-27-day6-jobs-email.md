# Ngày 6 — Worker pg-boss + React Email + email xác nhận đặt hàng

Nguồn: [../06-plan-10-days.md](../06-plan-10-days.md) (Ngày 6), [../04-payment-checkout-flow.md](../04-payment-checkout-flow.md) (mục "Jobs" + "Email").
Nền: Ngày 5 đã xong (`main` @ `c311881`) — `createOrderCore` tạo `Order` PENDING_PAYMENT trong 1 `$transaction`, **chưa** enqueue gì.

## Mục tiêu

Khi khách đặt hàng thành công, một **job nền** được ghi **cùng transaction tạo đơn** (rollback đơn ⇒ mất job, không bao giờ có job mồ côi), worker riêng nhận job và **gửi email xác nhận đặt hàng** (kèm mã VietQR + hướng dẫn CK) qua Resend.

## Quyết định đã chốt (user)

1. **Gửi email THẬT qua Resend ngay từ Ngày 6** (không làm transport "console"). Test **không bao giờ** gửi thật — handler nhận `Mailer` qua tham số, test tiêm fake.
2. **Phạm vi đúng `docs/06`**: chỉ hạ tầng job + email "đặt hàng thành công". **KHÔNG** trừ kho, **KHÔNG** chuyển PAID, **KHÔNG** webhook, **KHÔNG** cron `expire-unpaid`, **KHÔNG** template `payment-confirmed` — tất cả để Ngày 7.
3. **Test job = integration thật + unit**: chạy pg-boss thật trên `leafshoes_test` để chứng minh tính nguyên tử (enqueue trong transaction) và worker xử lý được job. Không chạy worker trong Playwright.

## Thư viện & API (đã tra tài liệu, KHÔNG dùng trí nhớ)

**pg-boss `12.26.3`** (`engines: node >=22.12`, local đang Node v24.16 ✓) — tài liệu `github.com/timgit/pg-boss/docs/api/*`:

- `new PgBoss({ connectionString, schema?, supervise?, schedule?, migrate? })`; `await boss.start()` **tự tạo/migrate schema `pgboss`** (mặc định `schema: "pgboss"`, nằm trong CÙNG database — Prisma không quản lý schema này, không có migration Prisma nào cho nó).
- `await boss.createQueue(name, opts?)` — SQL là `INSERT ... ON CONFLICT DO NOTHING` ⇒ **idempotent**, gọi mỗi lần khởi động được.
- `await boss.send(name, data, options)` → `Promise<string | null>` (job id).
- `await boss.work(name, options, handler)` — **handler nhận MẢNG job** (`batchSize` mặc định 1 ⇒ mảng 1 phần tử), throw ⇒ retry theo `retryLimit` (mặc định 2).
- `await boss.stop()` — graceful, chờ job đang chạy.
- **Enqueue trong transaction Prisma** — pg-boss v12 có adapter chính chủ:
  ```ts
  import PgBoss, { fromPrisma } from "pg-boss";
  await prisma.$transaction(async (tx) => {
    await tx.order.create({ ... });
    await boss.send("send-order-confirmation", { orderCode }, { db: fromPrisma(tx) });
  });
  ```
  `fromPrisma(tx)` chỉ cần `tx.$queryRawUnsafe` (Prisma v7 + `@prisma/adapter-pg` — đúng stack ta đang dùng). Rollback transaction ⇒ job biến mất.
- LƯU Ý: `send()` tra metadata queue qua **pool riêng của boss** (không qua `tx`) và **throw `Queue X does not exist`** nếu queue chưa được tạo ⇒ instance boss phía app phải `start()` + `createQueue()` trước khi `send`.
- Test helper: `new PgBoss({ ..., __test__enableSpies: true })` → `boss.getSpy(name).waitForJob(selector, 'completed')` — chờ job đúng trạng thái, **không cần sleep/polling thủ công**.

**react-email `6.9.1`** — **breaking change v6**: mọi component **và** `render` đều import từ package `react-email` (KHÔNG còn `@react-email/components`):
```ts
import { Html, Head, Body, Container, Section, Text, Img, render } from "react-email";
const html = await render(<OrderConfirmationEmail {...props} />);
const text = await render(<OrderConfirmationEmail {...props} />, { plainText: true });
```

**resend `6.18.0`** — `new Resend(apiKey)`, `await resend.emails.send({ from, to, subject, html, text })` trả `{ data, error }` (**KHÔNG throw** — phải tự kiểm tra `error`). Ta gửi `html`/`text` đã render sẵn (không dùng prop `react`) để tách bạch render/gửi và tránh peer dep `@react-email/render`.

## Ràng buộc toàn cục (Global Constraints) — reviewer bám vào đây

1. **Enqueue phải nằm TRONG transaction tạo đơn** qua `fromPrisma(tx)`. Đơn rollback ⇒ **không có job**. Enqueue lỗi ⇒ **đơn cũng fail** (nguyên tử, đúng `docs/04`).
2. **Payload job KHÔNG chứa PII**: chỉ `{ orderCode }`. Handler tự đọc lại `Order` từ DB. (Payload nằm trong bảng `pgboss.job`, giữ được 14 ngày — không nhét email/SĐT/địa chỉ vào đó.)
3. **KHÔNG log PII** ở bất kỳ đâu (worker, handler, mailer): không log email khách, SĐT, địa chỉ, nội dung email. Log được: `orderCode`, tên queue, job id, thông báo lỗi không chứa PII.
4. **Test tuyệt đối không gửi email thật**: handler và worker nhận `Mailer` qua tham số (dependency injection). `mailerFromEnv()` chỉ được gọi ở entrypoint worker.
5. **Không secret nào được commit**: `.env.example` chỉ có placeholder; `RESEND_API_KEY` thật do user tự điền vào `.env` (đã gitignore).
6. **Phạm vi**: KHÔNG trừ kho, KHÔNG đổi status, KHÔNG webhook, KHÔNG cron, KHÔNG template payment-confirmed.
7. **Tiền = số nguyên VND** (`formatVnd` để hiển thị); **toàn bộ chữ trong email là tiếng Việt có dấu**; **TypeScript strict**, không `any`.
8. **Kiến trúc cũ giữ nguyên**: core thuần (`src/server/*`, `src/jobs/handlers/*` nhận `db`/`mailer` qua tham số, không import `next/*`) / action mỏng. `createOrderCore` vẫn không tự gọi auth.
9. **QR trong email dùng lại `buildVietQrImageUrl` + `vietQrConfigFromEnv`** của Ngày 5 (`amount = order.total`, `addInfo = order.orderCode`) — không sinh URL bằng tay ở template.
10. **Không phá E2E Ngày 5**: `e2e/checkout.spec.ts` vẫn phải xanh. Playwright chạy `npm run build && npm run start` (không có worker) ⇒ **đặt hàng vẫn phải thành công dù worker không chạy** — job chỉ nằm chờ trong queue.

> Hệ quả của (1)+(10): app phải `createQueue` khi khởi tạo boss (không phụ thuộc worker đã chạy hay chưa), nếu không `send` sẽ throw và làm hỏng checkout.

## Biến môi trường mới (`.env.example` chỉ placeholder)

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `RESEND_API_KEY` | worker | User tự điền vào `.env`. |
| `MAIL_FROM` | worker | VD `leafshoes <onboarding@resend.dev>` (sandbox Resend). |
| `MAIL_TO_OVERRIDE` | không | Dev: ép mọi email về 1 địa chỉ. **Cần khi dùng sandbox** `onboarding@resend.dev` vì Resend chỉ cho gửi tới email chủ tài khoản. |
| `APP_BASE_URL` | không | Mặc định `http://localhost:3000`; dùng dựng link `/orders/<code>` trong email. |
| `PGBOSS_SCHEMA` | không | Mặc định `pgboss`. |

## Thứ tự task

```
T1 (deps + mailer + template email, thuần)
   → T2 (src/jobs/queue.ts: boss singleton + createQueue + enqueue trong tx) 
      → T3 (handler + src/worker/index.ts + integration worker thật)
         → T4 (nối enqueue vào createOrderCore + test nguyên tử)
            → T5 (docs + .env.example + cổng cuối ngày)
```

---

### Task 1 — Deps + `src/lib/mailer.ts` + template React Email (thuần, không DB, không queue)

**Cài deps:** `npm i pg-boss@^12.26.3 resend@^6.18.0 react-email@^6.9.1` (pg-boss dùng ở T2, cài luôn một lần).

**File tạo:**

- `src/lib/mailer.ts`
  ```ts
  export type MailMessage = { to: string; subject: string; html: string; text: string };
  export interface Mailer { send(message: MailMessage): Promise<void>; }
  export function createResendMailer(config: { apiKey: string; from: string; toOverride?: string }): Mailer;
  export function mailerFromEnv(): Mailer; // đọc RESEND_API_KEY/MAIL_FROM/MAIL_TO_OVERRIDE, thiếu bắt buộc → throw
  ```
  - `createResendMailer` gọi `new Resend(apiKey)` rồi `resend.emails.send({ from, to, subject, html, text })`; **kiểm tra `error` trong kết quả trả về** (resend KHÔNG throw) → nếu có lỗi thì `throw new Error(...)` để pg-boss retry. Thông báo lỗi **không được chứa địa chỉ email**.
  - `toOverride` (nếu có) thay thế `to` — dùng cho sandbox dev.
  - Để test được không cần mạng: cho phép tiêm client qua tham số nội bộ, VD `createResendMailer(config, deps?: { client?: { emails: { send(...) } } })` — mặc định tạo `Resend` thật. (Không dùng `vi.mock` toàn module.)
- `src/emails/order-confirmation.tsx` — component `OrderConfirmationEmail(props)` dùng component của `react-email` (import từ `"react-email"`), props:
  ```ts
  type OrderConfirmationEmailProps = {
    orderCode: string; customerName: string;
    items: { productName: string; size: string; color: string; unitPrice: number; quantity: number }[];
    subtotal: number; shippingFee: number; total: number;
    address: { province: string; ward: string; addressLine: string };
    qrImageUrl: string; bank: { bankCode: string; accountNo: string; accountName: string };
    orderUrl: string;
  };
  ```
  Nội dung tiếng Việt: lời cảm ơn, **mã đơn** `orderCode`, bảng sản phẩm (tên, size, màu, SL, đơn giá), tạm tính / phí ship / **tổng cộng** (dùng `formatVnd` từ `@/lib/money`), địa chỉ giao, **ảnh QR** (`<Img src={qrImageUrl} />`), số TK + chủ TK + ngân hàng, **nội dung CK = `orderCode`** (nhấn mạnh), link xem đơn `orderUrl`.
- `src/emails/render.ts` (hoặc export trong chính file trên) — `renderOrderConfirmationEmail(props): Promise<{ subject: string; html: string; text: string }>`; `subject` = `` `Đơn hàng ${orderCode} — leafshoes Việt Nam` ``.

**Test (unit, không mạng):**
- `src/lib/mailer.test.ts`: gọi đúng `from/to/subject/html/text`; `toOverride` ghi đè `to`; kết quả `{ error }` từ resend → **throw**; `mailerFromEnv` thiếu `RESEND_API_KEY`/`MAIL_FROM` → throw (dùng `vi.stubEnv`).
- `src/emails/order-confirmation.test.tsx`: `html` chứa `orderCode`, chứa tổng tiền đã format, chứa `qrImageUrl`, chứa tên từng sản phẩm; `text` (plainText) chứa `orderCode`; không throw.

**Cập nhật `.env.example`:** thêm `RESEND_API_KEY`/`MAIL_FROM`/`# MAIL_TO_OVERRIDE`/`# APP_BASE_URL` (placeholder, **không** giá trị thật).

**Model:** standard.

---

### Task 2 — `src/jobs/queue.ts`: boss singleton + queue + enqueue trong transaction

**File tạo:**

- `src/jobs/queue.ts`
  ```ts
  export const QUEUE_SEND_ORDER_CONFIRMATION = "send-order-confirmation";
  export const orderConfirmationJobSchema = z.object({ orderCode: z.string().min(1) }); // KHÔNG có PII
  export type OrderConfirmationJob = z.infer<typeof orderConfirmationJobSchema>;

  export function createBoss(options?: { connectionString?: string; supervise?: boolean; schedule?: boolean }): PgBoss;
  export async function ensureQueues(boss: PgBoss): Promise<void>;   // createQueue cho mọi queue (idempotent)
  export async function getBoss(): Promise<PgBoss>;                  // singleton phía app: start() + ensureQueues, cache trên globalThis (giống src/lib/prisma.ts)
  export async function enqueueOrderConfirmation(
    tx: PrismaTransactionLike, payload: OrderConfirmationJob, boss?: PgBoss,
  ): Promise<void>;                                                  // boss.send(..., { db: fromPrisma(tx) })
  ```
  - `getBoss()` dùng `DATABASE_URL`, `schema: process.env.PGBOSS_SCHEMA ?? "pgboss"`, **`supervise: false, schedule: false`** (app chỉ ghi job, không giám sát/không chạy cron) và cache trên `globalThis` để HMR/dev không tạo nhiều pool.
  - `enqueueOrderConfirmation` cho phép **tiêm boss** (tham số thứ 3) để test/gọi tường minh; mặc định `await getBoss()`.
- `src/test/boss.ts` (helper test): tạo `PgBoss` trỏ `DATABASE_URL_TEST`, `schema` test, `__test__enableSpies: true`; hàm `resetQueues(boss)` xoá sạch job (VD `DELETE FROM <schema>.job`) để test không dính job của lần chạy trước.

**Test:**
- `src/jobs/queue.integration.test.ts` (pg-boss THẬT trên `leafshoes_test`, mailer không liên quan):
  1. `enqueueOrderConfirmation` trong `testPrisma.$transaction` **commit** → job tồn tại trong queue (đếm bằng `boss.getQueueSize(...)` hoặc query bảng job), payload đúng `{ orderCode }`.
  2. Cùng transaction nhưng **throw** ở cuối → transaction rollback → **không có job nào** (đây là bằng chứng tính nguyên tử, phải fail nếu ai đó bỏ `fromPrisma`).
  3. `ensureQueues` gọi 2 lần liên tiếp không lỗi (idempotent).
- Unit: `orderConfirmationJobSchema` loại payload thiếu `orderCode`.

**Lưu ý cho implementer:** schema `pgboss` **không** do Prisma migrate tạo — `boss.start()` tự tạo. `resetDb()` hiện tại KHÔNG đụng schema này; đừng thêm bảng pgboss vào `resetDb()` (nó chạy trước khi schema tồn tại) — dọn job trong chính file test qua helper.

**Model:** standard.

---

### Task 3 — Handler `send-order-confirmation` + tiến trình worker

**File tạo:**

- `src/jobs/handlers/send-order-confirmation.ts`
  ```ts
  export async function handleSendOrderConfirmation(
    deps: { db: PrismaClient; mailer: Mailer },
    payload: unknown,
  ): Promise<void>;
  ```
  - `orderConfirmationJobSchema.parse(payload)` → tìm `order` theo `orderCode` (`include: { items: true }`); không thấy → **throw** (để pg-boss retry rồi fail — không nuốt lỗi âm thầm).
  - Dựng `qrImageUrl` bằng `buildVietQrImageUrl({ ...vietQrConfigFromEnv(), amount: order.total, addInfo: order.orderCode })`; `orderUrl` = `${APP_BASE_URL ?? "http://localhost:3000"}/orders/${order.orderCode}`.
  - `renderOrderConfirmationEmail(...)` → `mailer.send({ to: order.email, subject, html, text })`.
  - **Không log PII.**
- `src/worker/index.ts` — entrypoint:
  - `const boss = createBoss()` (supervise mặc định **bật** ở worker), `await boss.start()`, `await ensureQueues(boss)`;
  - `boss.on("error", ...)` log lỗi (không PII);
  - `await boss.work(QUEUE_SEND_ORDER_CONFIRMATION, {}, async (jobs) => { for (const job of jobs) await handleSendOrderConfirmation({ db: prisma, mailer }, job.data); })` — **nhớ handler nhận MẢNG**;
  - `mailer = mailerFromEnv()` gọi **một lần** khi khởi động (fail fast nếu thiếu env);
  - graceful shutdown: `SIGINT`/`SIGTERM` → `await boss.stop()` → `process.exit(0)`.
- `package.json`: thêm script `"worker": "tsx src/worker/index.ts"`.

**Test:**
- `src/jobs/handlers/send-order-confirmation.integration.test.ts` (DB thật + **fake mailer**, không mạng):
  1. Có order thật trong DB → handler gọi `mailer.send` đúng 1 lần, `to` = email của order, `html` chứa `orderCode` + tổng tiền + URL QR có `addInfo=<orderCode>`.
  2. `orderCode` không tồn tại → throw.
  3. Payload sai schema → throw.
- `src/jobs/worker.integration.test.ts` (pg-boss THẬT + fake mailer): `boss.work(...)` với cùng hàm handler → `enqueueOrderConfirmation` → dùng **spy** `waitForJob(d => d.orderCode === code, "completed")` → job `completed` và fake mailer đã nhận đúng 1 email. Kết thúc test `await boss.stop()`.
  - Nếu spy không dùng được, fallback: chờ có điều kiện (poll trạng thái job) — **không** dùng `setTimeout` cố định.

**Model:** standard.

---

### Task 4 — Nối enqueue vào `createOrderCore` (cùng transaction)

**Sửa `src/server/orders.ts`:**
- Thêm tham số deps **có mặc định** để giữ core test được:
  ```ts
  export type CreateOrderDeps = {
    enqueueOrderConfirmation: (tx: Prisma.TransactionClient, payload: { orderCode: string }) => Promise<void>;
  };
  export async function createOrderCore(
    db: PrismaClient, input: CreateOrderInput, deps: CreateOrderDeps = { enqueueOrderConfirmation },
  ): Promise<OrderWithItems>
  ```
- Gọi `await deps.enqueueOrderConfirmation(tx, { orderCode: order.orderCode })` **bên trong** `$transaction`, **sau** khi `order.create` thành công, và **trả về order sau đó** (enqueue throw ⇒ transaction rollback ⇒ không có đơn, không có job).
- Cập nhật comment đầu file: bỏ dòng "KHÔNG enqueue email/job — thuộc Ngày 6"; ghi rõ **vẫn chưa trừ kho** (Ngày 7).
- `src/server/actions/checkout.ts`: **không đổi API**; kiểm tra lại thông báo lỗi trả về client không rò rỉ chi tiết nội bộ hạ tầng (nếu enqueue lỗi, `err.message` có thể là lỗi pg-boss) → map lỗi không phải lỗi nghiệp vụ về câu chung `"Không thể tạo đơn hàng, vui lòng thử lại."`; **không log PII**.

**Test:**
- `src/server/orders.integration.test.ts` (bổ sung):
  1. Đặt hàng thành công → deps fake ghi nhận đúng `{ orderCode }` = orderCode của đơn vừa tạo, gọi **đúng 1 lần**.
  2. Hết hàng (đơn fail) → deps fake **không** được gọi / hoặc có gọi nhưng transaction rollback ⇒ **0 order**; khẳng định không có job mồ côi.
  3. Deps `enqueueOrderConfirmation` **throw** → `createOrderCore` throw **và** DB có **0 order** (bằng chứng job & đơn nguyên tử).
  4. Test **nguyên tử thật** (pg-boss thật, không fake): tạo đơn qua `createOrderCore` với deps mặc định (boss test tiêm vào) → job tồn tại trong queue với `orderCode` đúng.
- `src/server/actions/checkout.test.ts` (bổ sung): lỗi hạ tầng → trả câu lỗi chung, `ok: false`.

**Model:** standard.

---

### Task 5 — Tài liệu + cổng cuối ngày

- `.env.example`: chốt đủ 5 biến mới (placeholder, không giá trị thật).
- `README.md` (hoặc mục dev trong `docs/plans/README.md`): cách chạy worker (`npm run worker`), lưu ý sandbox Resend (`MAIL_FROM=onboarding@resend.dev` chỉ gửi được tới email chủ tài khoản ⇒ dùng `MAIL_TO_OVERRIDE`), lưu ý schema `pgboss` tự tạo khi start.
- `docs/plans/README.md`: điền link plan Ngày 6 vào bảng lộ trình.
- **Cổng cuối ngày (controller tự chạy, đòi bằng chứng thật):**
  - `npx prisma migrate status` — up-to-date (Ngày 6 **không** thêm migration Prisma nào).
  - `npm run test` — toàn bộ xanh (bao gồm integration pg-boss thật).
  - `npm run build` — xanh (nếu Next bundling vướng `pg-boss`, thêm `serverExternalPackages: ["pg-boss"]` vào `next.config.ts` và ghi lý do).
  - `npm run test:e2e` — Playwright xanh, **đặc biệt `checkout.spec.ts`** (chạy KHÔNG có worker: đơn vẫn tạo được, job nằm chờ).
  - Kiểm tra bằng tay 1 lần: chạy `npm run worker` với `.env` thật → đặt 1 đơn ở dev → thấy email tới hộp thư (`MAIL_TO_OVERRIDE`). Nếu user chưa điền `RESEND_API_KEY` thì ghi rõ là chưa kiểm chứng gửi thật.

**Model:** standard (task tài liệu + chạy gate).

---

## Rủi ro & cách giảm

| Rủi ro | Giảm thiểu |
|---|---|
| `send()` throw vì queue chưa tồn tại → **hỏng checkout** | `getBoss()` luôn `ensureQueues()` sau `start()`; có test enqueue trên DB sạch (chưa từng chạy worker) |
| Test dính job của lần chạy trước → flaky | Helper `resetQueues()` xoá job trước mỗi test; `fileParallelism:false` đang bật |
| Resend sandbox từ chối gửi tới email lạ (403) | `MAIL_TO_OVERRIDE` ở dev; job fail sẽ retry rồi dừng, không ảnh hưởng đơn đã tạo |
| Vô tình gửi email thật khi chạy test | `Mailer` luôn tiêm từ ngoài; **cấm** gọi `mailerFromEnv()` ngoài `src/worker/index.ts` |
| Rò rỉ PII vào bảng `pgboss.job` | Payload chỉ `{ orderCode }` (ràng buộc bằng zod + review) |
| `pg-boss` vỡ khi Next bundle | `serverExternalPackages` trong `next.config.ts` nếu build lỗi |
