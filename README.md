# leafshoes Việt Nam

Demo thương mại điện tử bán giày (tiếng Việt): duyệt sản phẩm → giỏ hàng → checkout khách vãng lai → VietQR → email xác nhận đơn qua job nền → admin quản lý sản phẩm và xử lý đơn hàng.

Stack: **Next.js 16** (App Router, TS strict) · **Prisma 7** + Postgres · **Better Auth** (RBAC owner/staff) · **Zustand** (giỏ hàng) · **pg-boss** (job nền) · **React Email** + **Resend** · **Vitest** (unit + integration trên DB thật) · **Playwright** (E2E).

Kiến trúc, nghiệp vụ và runbook vận hành: [`docs/`](docs/README.md).

## Production deployment

Runbook Komodo, Cloudflare Tunnel, backup, rollback và acceptance: [`docs/08-production-runbook.md`](docs/08-production-runbook.md).
Các lệnh này chỉ chạy với production environment do Komodo cấp; không dùng
`.env.example` làm credential thật.

```bash
npm run deploy:production
npm run backup:production
npm run test:smoke
```

### Image trên GitHub Container Registry

[`.github/workflows/publish-images.yml`](.github/workflows/publish-images.yml)
build năm target của [`Dockerfile`](Dockerfile) và push lên `ghcr.io` mỗi khi
`main` được cập nhật hoặc khi chạy tay
(*Actions → Publish images → Run workflow*):

| Image | Target | Vai trò |
| --- | --- | --- |
| `ghcr.io/<owner>/<repo>/app` | `app` | Next.js standalone server |
| `ghcr.io/<owner>/<repo>/worker` | `worker` | Worker pg-boss |
| `ghcr.io/<owner>/<repo>/migrate` | `migrate` | `prisma migrate deploy` một lần |
| `ghcr.io/<owner>/<repo>/smoke` | `smoke` | Playwright smoke sau deploy |
| `ghcr.io/<owner>/<repo>/dashboard` | `dashboard` | Dashboard vận hành pg-boss |

Mỗi image được gắn tag bằng full commit SHA và thêm `latest` khi push `main`.

`docker-compose.prod.yml` pull chính những image này thay vì build trên VPS;
`npm run deploy:production` chạy `docker compose pull` cho cả bốn service trước
khi động vào container nào, nên thiếu image là deploy dừng lúc bản cũ còn chạy
nguyên. Rollback vì thế chỉ là pull lại tag sha cũ.

Hai điều cần biết:

- Repo đang public nên package cũng public: VPS pull không cần credential.
  Chuyển repo sang private thì package thành private theo và host phải
  `docker login ghcr.io` bằng token có `read:packages` — mục 1 của runbook.
- Không service nào trong file prod còn `build:`, vì Compose có cả `build:` lẫn
  `image:` sẽ *âm thầm build từ source* khi pull hụt. Cần build tại chỗ thì phải
  nói rõ:

  ```bash
  BUILD_LOCALLY=1 npm run deploy:production
  ```

  Lệnh này thêm [`docker-compose.build.yml`](docker-compose.build.yml) vào,
  đặt `pull_policy: build`, và chỉ dành cho lúc registry không tới được.

## Storefront UI

- Storefront có banner tĩnh, lối vào danh mục, sản phẩm nổi bật, dải cam kết
  và footer; storefront/admin đã được kiểm tra ở mobile `390×844` và desktop
  `1440×1000`.
- Logo lá, banner và sáu ảnh sản phẩm hiện là asset tạm thời, có thể thay thế
  khi cửa hàng cung cấp bộ nhận diện và ảnh thật. Storefront không triển khai
  carousel hoặc giao diện giảm giá khi chưa có dữ liệu/campaign thật.
- Có skip link, focus bàn phím, reduced motion cùng các trạng thái rỗng/lỗi.
  Các hạng mục storefront chưa triển khai được giữ tại
  [`docs/07-post-day10-storefront-backlog.md`](docs/07-post-day10-storefront-backlog.md).

Thông tin doanh nghiệp hiển thị ở footer public:

- **CÔNG TY TNHH LEAFSHOES VIỆT NAM**
- Sản xuất giày dép, phụ liệu dép
- Điện thoại: `0395.069.089`
- Email: `leafshoesvn@gmail.com`
- Địa chỉ: Số 14, Đường Phú Sơn 3, Xã Bình Minh, TP. Đồng Nai

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
- Cấu hình payment code phía SePay: prefix `LEAF`, suffix đúng 6 ký tự alphanumeric. Mã đơn/payment canonical là `LEAFXXXXXX` (`^LEAF[A-Z0-9]{6}$`).
- Event dùng `payload.id` chính thức của SePay làm ID giao dịch duy nhất. Event hợp lệ cùng original JSON được lưu trước khi khởi tạo queue; retry chỉ dùng canonical code/amount đã persist. Queue warm-up lỗi vẫn giữ event `RECEIVED`; giao dịch thiếu/sai mã đơn, lệch tiền, đơn không còn pending hoặc thiếu tồn kho được giữ ở `BankTransaction.REVIEW_REQUIRED` cho màn hình xử lý của admin.
- Kết quả đã khớp, webhook lặp và giao dịch cần review đều được acknowledge HTTP 200 với body chính xác `{"success":true}`. Lỗi chữ ký/validation/hạ tầng không giả thành success.

## Vận hành đơn hàng

- `owner` và `staff` có quyền như nhau đối với các thao tác đơn hàng: xem/lọc đơn, xác nhận thanh toán, chuyển trạng thái, ghi nhận hoàn tiền và ghép giao dịch cần đối soát. Quyền CRUD sản phẩm vẫn theo RBAC riêng. Các invariant nằm trong [`docs/06-admin-order-domain.md`](docs/06-admin-order-domain.md).
- Chuyển trạng thái do admin chỉ gồm `PENDING_PAYMENT → CANCELLED`, `PAID → FULFILLED` và `FULFILLED → COMPLETED`. Đơn `COMPLETED`, `CANCELLED`, `EXPIRED` là trạng thái cuối; đơn đã hoàn toàn bộ không thể chuyển `PAID → FULFILLED`.
- Sổ thanh toán dùng `Payment.direction`: `IN` là tiền nhận, `OUT` là khoản hoàn do admin ghi nhận. Trạng thái hoàn tiền được suy ra từ tổng `IN/OUT`; `Order.lastRefundAt` lưu thời điểm ghi nhận hoàn tiền gần nhất.
- Giao dịch SePay `REVIEW_REQUIRED` được giữ trong hàng đợi đối soát. Admin nhập mã đơn thật để ghép thủ công; hệ thống vẫn kiểm tra số tiền, trạng thái pending và tồn kho trước khi dùng cùng luồng xác nhận thanh toán.
- Ghi nhận hoàn tiền chỉ tạo bút toán `OUT`: ứng dụng **không tự chuyển tiền qua ngân hàng**, không đổi trạng thái đơn và không hoàn tồn kho.

## Trang nội dung tĩnh

Ngoài luồng mua hàng, site có bảy trang chữ: `/gioi-thieu`, `/nha-may`,
`/chi-nhanh` (menu "Doanh nghiệp" trên navbar) và bốn trang chính sách
`/chinh-sach/{thanh-toan,giao-hang,doi-tra,bao-mat}` (chân trang).

- Nội dung nằm trong `src/lib/company-content.ts` và `src/lib/policy-content.ts`
  dưới dạng constant `ContentPage` — **không** có trong database, nên sửa chữ là
  sửa code (và biên tập viên không cần vào admin). Bốn trang chính sách dùng
  chung route động `/chinh-sach/[slug]` và được prerender lúc build.
- `src/lib/content-pages.test.ts` chốt các bất biến: không trang nào rỗng hay còn
  chỗ chờ điền, `href` khớp slug thật (không có link chết trong navbar/footer),
  và điều hướng được suy ra từ chính nội dung.
- **Trang chính sách mô tả hành vi thật của hệ thống** — phí giao hàng phẳng
  30.000 ₫, đơn chưa thanh toán hết hạn sau 24 giờ, chỉ nhận chuyển khoản VietQR
  với nội dung đúng mã đơn. Đổi các hành vi này trong code thì phải sửa cả trang
  tương ứng, nếu không là hứa sai với khách. Các giá trị chưa có căn cứ trong
  code (giờ làm việc, thời hạn đổi trả, thời gian giao dự kiến) được liệt kê
  trong [`docs/07`](docs/07-post-day10-storefront-backlog.md) để chủ shop xác nhận.

## Email

Email xác nhận đơn hàng render bằng React Email, gửi qua Resend từ worker.

- Email xác nhận thanh toán dùng provider idempotency key ổn định `payment-confirmed:<orderCode>` để retry không gửi trùng.
- `MAIL_FROM` phải thuộc **domain đã verify** trong Resend. Không gửi được từ địa chỉ `@gmail.com` (Resend đòi quyền DNS trên domain gửi). Domain dự kiến của shop là **`leafshoesvietnam.com`** — khi verify xong thì đặt `MAIL_FROM="no-reply@leafshoesvietnam.com"`.
- Chưa verify domain? Dùng sandbox `onboarding@resend.dev` — nhưng Resend **chỉ giao tới email chủ tài khoản**, nên đặt `MAIL_TO_OVERRIDE` để mọi email ở dev đổ về một hộp thư. Gửi từ một domain chưa verify bị Resend trả `422 domain is not verified` và job sẽ fail.
- `MAIL_REPLY_TO` = hộp thư của shop: dùng làm `replyTo` cho mọi email và in ở chân email làm địa chỉ liên hệ, để khách bấm Reply là thư về đúng hộp đó.
- `APP_BASE_URL` dùng để dựng link `/orders/<mã đơn>` trong email — **bắt buộc cho worker** (không có mặc định localhost cho worker; thiếu biến này worker từ chối khởi động thay vì mail khách một link chết).

## Biến môi trường

Xem [`.env.example`](.env.example). Bắt buộc: `DATABASE_URL`, `DATABASE_URL_TEST`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SEED_*`, `VIETQR_*`, `SEPAY_WEBHOOK_SECRET`.

Worker (`npm run worker`) xác thực lúc khởi động, cần thêm: `RESEND_API_KEY`, `MAIL_FROM`, `VIETQR_BANK_CODE`/`VIETQR_ACCOUNT_NO`/`VIETQR_ACCOUNT_NAME` (đã bắt buộc chung ở trên, worker chỉ xác thực lại sớm hơn), và **`APP_BASE_URL`** (bắt buộc riêng cho worker — không dùng mặc định localhost).

Tuỳ chọn: `MAIL_TO_OVERRIDE`, `MAIL_REPLY_TO`, `PGBOSS_SCHEMA`, `UPLOAD_DIR`, `MAX_UPLOAD_BYTES`, `VIETQR_TEMPLATE`.
