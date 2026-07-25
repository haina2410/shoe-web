# leafshoes Việt Nam

Demo thương mại điện tử bán giày (tiếng Việt): duyệt sản phẩm → giỏ hàng → checkout khách vãng lai → VietQR → email xác nhận đơn qua job nền → admin quản lý sản phẩm.

Stack: **Next.js 16** (App Router, TS strict) · **Prisma 7** + Postgres · **Better Auth** (RBAC owner/staff) · **Zustand** (giỏ hàng) · **pg-boss** (job nền) · **React Email** + **Resend** · **Vitest** (unit + integration trên DB thật) · **Playwright** (E2E).

Tài liệu thiết kế: [`docs/`](docs/README.md). Kế hoạch triển khai theo ngày: [`docs/plans/`](docs/plans/README.md).

## Chuẩn bị

- Node.js **≥ 22.12** (pg-boss 12 yêu cầu; dự án đang chạy Node 24).
- Postgres chạy local (Homebrew). Tạo 2 database:

```bash
createdb leafshoes_development && createdb leafshoes_test
```

## Cài đặt

```bash
npm install
```

```bash
cp .env.example .env
```

Điền giá trị thật vào `.env` (file này **đã gitignore**, không bao giờ commit). Sau đó sinh Prisma Client (thư mục `src/generated/prisma` không được commit):

```bash
npx prisma generate
```

Chạy migration + seed dữ liệu mẫu:

```bash
npx prisma migrate dev && npm run db:seed
```

## Chạy

| Lệnh | Việc |
|---|---|
| `npm run dev` | Web app (http://localhost:3000) |
| `npm run worker` | **Tiến trình worker** xử lý job nền (gửi email) — chạy song song web app |
| `npm run db:seed` | Seed danh mục/sản phẩm/biến thể + 34 tỉnh thành + phí ship |
| `npm test` | Vitest (unit + integration trên `leafshoes_test`) |
| `npm run test:e2e` | Playwright (tự chạy `npm run build && npm run start`) |
| `npm run build` | Build production |

Web app và worker là **hai tiến trình riêng**, dùng chung một database:

```bash
npm run worker
```

Đặt hàng vẫn thành công khi worker **không** chạy — job chỉ nằm chờ trong hàng đợi tới khi worker khởi động (bộ E2E chạy đúng theo kiểu này).

## Job nền (pg-boss)

- Worker xử lý cả hai queue email: `send-order-confirmation` khi tạo đơn và `send-payment-confirmed` khi nhận tiền. Worker cũng đăng ký lịch UTC `expire-unpaid` mỗi 15 phút để chuyển đơn `PENDING_PAYMENT` quá 24 giờ sang `EXPIRED`.
- Cả job `send-order-confirmation` lẫn `send-payment-confirmed` đều được ghi **trong cùng transaction nghiệp vụ** (qua adapter `fromPrisma(tx)` của pg-boss). Transaction rollback ⇒ job biến mất, không bao giờ có job mồ côi.
- Payload job **chỉ chứa `orderCode`** (không PII) — worker tự đọc lại đơn từ DB khi xử lý.
- pg-boss tự tạo/migrate schema `pgboss` trong cùng database ở lần `boss.start()` đầu tiên — **không** có migration Prisma nào cho schema này. Đổi tên schema qua `PGBOSS_SCHEMA` nếu cần.
- Queue cấu hình `retryLimit: 5, retryDelay: 60s, retryBackoff: true` (thay vì mặc định pg-boss `retryLimit: 2, retryDelay: 0`) để chịu được lỗi 429/5xx tạm thời từ Resend mà không mất email. Một job thất bại được log ra console (queue, jobId, `orderCode` — không PII) trước khi pg-boss tự retry/dead-letter.
- **`npm run worker` xác thực TOÀN BỘ biến môi trường mình cần lúc khởi động** (không phải lúc xử lý job đầu tiên) — thiếu bất kỳ biến bắt buộc nào bên dưới (mail, VietQR, `APP_BASE_URL`) sẽ khiến worker từ chối khởi động (fail fast) thay vì gửi mail lỗi hoặc chứa link chết.

## Webhook SePay

- `POST /api/webhooks/sepay` yêu cầu `X-SePay-Timestamp` (Unix seconds) và `X-SePay-Signature: sha256=<hex>`.
- Chữ ký là HMAC-SHA256 với `SEPAY_WEBHOOK_SECRET` trên đúng chuỗi `<timestamp>.<raw request body>`; không parse rồi stringify lại body trước khi verify. Timestamp chỉ hợp lệ trong cửa sổ 5 phút.
- Event dùng `payload.id` chính thức của SePay làm ID giao dịch duy nhất. Event hợp lệ luôn được lưu trước khi đối soát; giao dịch thiếu/sai mã đơn, lệch tiền, đơn không còn pending hoặc thiếu tồn kho được giữ ở `BankTransaction.REVIEW_REQUIRED` cho màn hình xử lý Ngày 8.
- Kết quả đã khớp, webhook lặp và giao dịch cần review đều được acknowledge HTTP 200 với body chính xác `{"success":true}`. Lỗi chữ ký/validation/hạ tầng không giả thành success.

## Email

Email xác nhận đơn hàng render bằng React Email, gửi qua Resend từ worker.

- `MAIL_FROM` phải thuộc **domain đã verify** trong Resend. Không gửi được từ địa chỉ `@gmail.com` (Resend đòi quyền DNS trên domain gửi). Domain dự kiến của shop là **`leafshoesvietnam.com`** — khi verify xong thì đặt `MAIL_FROM="no-reply@leafshoesvietnam.com"`.
- Chưa verify domain? Dùng sandbox `onboarding@resend.dev` — nhưng Resend **chỉ giao tới email chủ tài khoản**, nên đặt `MAIL_TO_OVERRIDE` để mọi email ở dev đổ về một hộp thư. Gửi từ một domain chưa verify bị Resend trả `422 domain is not verified` và job sẽ fail.
- `MAIL_REPLY_TO` = hộp thư của shop: dùng làm `replyTo` cho mọi email và in ở chân email làm địa chỉ liên hệ, để khách bấm Reply là thư về đúng hộp đó.
- `APP_BASE_URL` dùng để dựng link `/orders/<mã đơn>` trong email — **bắt buộc cho worker** (không có mặc định localhost cho worker; thiếu biến này worker từ chối khởi động thay vì mail khách một link chết).

## Biến môi trường

Xem [`.env.example`](.env.example). Bắt buộc: `DATABASE_URL`, `DATABASE_URL_TEST`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SEED_*`, `VIETQR_*`, `SEPAY_WEBHOOK_SECRET`.

Worker (`npm run worker`) xác thực lúc khởi động, cần thêm: `RESEND_API_KEY`, `MAIL_FROM`, `VIETQR_BANK_CODE`/`VIETQR_ACCOUNT_NO`/`VIETQR_ACCOUNT_NAME` (đã bắt buộc chung ở trên, worker chỉ xác thực lại sớm hơn), và **`APP_BASE_URL`** (bắt buộc riêng cho worker — không dùng mặc định localhost).

Tuỳ chọn: `MAIL_TO_OVERRIDE`, `MAIL_REPLY_TO`, `PGBOSS_SCHEMA`, `UPLOAD_DIR`, `MAX_UPLOAD_BYTES`, `VIETQR_TEMPLATE`.
