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

- Job `send-order-confirmation` được ghi **trong cùng transaction tạo đơn** (`createOrderCore` → `enqueueOrderConfirmation`, dùng adapter `fromPrisma(tx)` của pg-boss). Đơn rollback ⇒ job biến mất, không bao giờ có job mồ côi.
- Payload job **chỉ chứa `orderCode`** (không PII) — worker tự đọc lại đơn từ DB khi xử lý.
- pg-boss tự tạo/migrate schema `pgboss` trong cùng database ở lần `boss.start()` đầu tiên — **không** có migration Prisma nào cho schema này. Đổi tên schema qua `PGBOSS_SCHEMA` nếu cần.

## Email

Email xác nhận đơn hàng render bằng React Email, gửi qua Resend từ worker.

- `MAIL_FROM` phải thuộc **domain đã verify** trong Resend. Không gửi được từ địa chỉ `@gmail.com` (Resend đòi quyền DNS trên domain gửi).
- Chưa có domain riêng? Dùng sandbox `onboarding@resend.dev` — nhưng Resend **chỉ giao tới email chủ tài khoản**, nên đặt `MAIL_TO_OVERRIDE` để mọi email ở dev đổ về một hộp thư.
- `MAIL_REPLY_TO` = hộp thư của shop: dùng làm `replyTo` cho mọi email và in ở chân email làm địa chỉ liên hệ, để khách bấm Reply là thư về đúng hộp đó.

## Biến môi trường

Xem [`.env.example`](.env.example). Bắt buộc: `DATABASE_URL`, `DATABASE_URL_TEST`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SEED_*`, `VIETQR_*`; worker cần thêm `RESEND_API_KEY` và `MAIL_FROM`. Tuỳ chọn: `MAIL_TO_OVERRIDE`, `MAIL_REPLY_TO`, `APP_BASE_URL`, `PGBOSS_SCHEMA`, `UPLOAD_DIR`, `MAX_UPLOAD_BYTES`, `VIETQR_TEMPLATE`.
