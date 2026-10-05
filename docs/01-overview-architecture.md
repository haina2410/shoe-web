# 01 — Tổng quan kiến trúc

## Nguyên tắc

Một **Next.js app (App Router) duy nhất** phục vụ storefront + admin + API routes, cộng **một tiến trình worker** riêng chạy pg-boss dùng chung codebase & database. Tất cả đóng gói bằng Docker Compose trên một dedicated server.

Lý do monolith một codebase: một ngôn ngữ (TypeScript), frontend React dễ bảo
trì và không có glue code giữa nhiều ứng dụng khi quy mô hiện tại chưa cần tách.

## Sơ đồ

```
┌─────────────────────── Dedicated Server (Docker Compose) ───────────────────────┐
│                                                                                  │
│  [Next.js app]  ──server actions / API routes──►  [PostgreSQL]  ◄── [pg-boss     │
│   • Storefront (RSC)                                   ▲               worker]    │
│   • Admin (Better Auth + RBAC)                         │            • gửi email   │
│   • /api/webhooks/sepay ───────────┐                   │            • đối soát    │
│                                    │  enqueue (cùng    │            • hết hạn đơn │
│                                    └─ transaction) ────┘                          │
│                                                                                  │
│  [Origin: 127.0.0.1 qua Cloudflare Tunnel]            [Resend] ◄─ gửi email TT   │
│  [/admin_jobs → pg-boss dashboard tạm thời]           [Zalo Bot API] ◄─ báo đơn  │
└──────────────────────────────────────────────────────────────────────────────────┘
        ▲                                    ▲
   Khách (guest, chỉ email)            SePay/Casso webhook (khớp CK ngân hàng)
```

Production dùng `cloudflared` system service đã có trên VPS để kết thúc HTTPS
ở Cloudflare và chuyển request tới app bind trên loopback. Stack không cần
Caddy/Nginx và không mở origin web hoặc PostgreSQL ra Internet. PostgreSQL chỉ
publish trên loopback VPS tại `127.0.0.1:${POSTGRES_HOST_PORT:-5432}` để operator
truy cập qua SSH port forwarding.

Dashboard pg-boss là surface vận hành bật theo profile `ops`, bind riêng trên
loopback và được build cố định cho `/admin_jobs`. Khi cần dùng, Cloudflare Tunnel
chuyển nguyên prefix này tới dashboard; route phải đứng trước catch-all của app.
Dashboard vẫn yêu cầu HTTP Basic Auth vì có quyền retry và xoá job.

## Các thành phần

### 1. Storefront (khách hàng)
- Dùng **React Server Components** cho danh sách/chi tiết sản phẩm (SEO + tải nhanh).
- `/sitemap.xml` được tạo động từ các trang storefront công khai và sản phẩm `ACTIVE`; URL tuyệt đối dùng `APP_BASE_URL`.
- **Giỏ hàng giữ ở client** (localStorage, state qua Zustand) — không cần đăng nhập. Chỉ khi checkout mới gửi giỏ lên server để tạo đơn.
- Checkout: form thông tin nhận hàng + email (guest).

### 2. Admin (quản trị)
- Route nhóm `(admin)` được bảo vệ bằng **Better Auth** (email/mật khẩu) + **RBAC** (role OWNER/STAFF).
- Quản lý sản phẩm/biến thể/tồn kho, danh mục phẳng, đơn hàng và xác nhận thanh toán thủ công.
- UI bảng dữ liệu bằng **TanStack Table** trên nền shadcn/ui.

### 3. API routes
- `/api/webhooks/sepay` — nhận webhook đối soát ngân hàng từ SePay/Casso.
- `/api/admin/categories`, `/api/admin/images`, `/api/admin/products`, `/api/admin/products/validate`, `/api/admin/products/:id`, `/api/admin/products/:id/variants`, `/api/admin/products/:id/variants/:variantId` và `/api/admin/categories/:id` — [catalog API](09-catalog-api.md) dùng bearer token riêng, không nhận cookie Better Auth. API đọc/tìm kiếm catalog, upload ảnh, tạo sản phẩm `DRAFT`, cập nhật/publish/archive/xóa sản phẩm, tạo/sửa/xóa biến thể và quản lý danh mục phẳng theo scope.
- Server Actions cho mutation (tạo đơn, cập nhật tồn kho...) thay cho nhiều REST endpoint.

### 4. Worker (pg-boss)
- Tiến trình Node riêng (`worker.ts`), cùng repo, kết nối cùng Postgres.
- Xử lý job: gửi email (đặt hàng, đã thanh toán), đối soát, cron **hết hạn đơn chưa thanh toán**, và dọn ảnh sản phẩm không còn tham chiếu.
- Job `send-zalo-order-created` chỉ mang `orderCode` và khoá người nhận; worker tra đơn khi gửi thông báo Zalo cho nhân viên.
- Job gắn với thay đổi dữ liệu được enqueue trong cùng transaction để dữ liệu và job cùng commit hoặc rollback. Gợi ý dọn ảnh từ form được enqueue theo batch nguyên tử; worker kiểm tra lại tham chiếu trước khi xóa. Worker chia sẻ uploads volume với app và xử lý job at-least-once.

### 5. Zalo Bot API

- Zalo là dịch vụ ngoài dùng Bot API trực tiếp cho thông báo đơn mới nội bộ.
- Danh sách người nhận là cấu hình mã nguồn có khoá ổn định và chat ID; hàng đợi chỉ lưu khoá, không lưu chat ID hay PII khách hàng.
- App chọn người nhận lúc enqueue theo `APP_ENV`: development/staging gửi Nam, production gửi Nam và Sung.

## Ranh giới module (để dễ hiểu & test độc lập)

| Module | Chức năng | Phụ thuộc |
|---|---|---|
| `catalog` | Sản phẩm, biến thể, danh mục, tồn kho | DB |
| `catalog-api` | Bearer scope, rate/quota, validation, idempotency, audit và ảnh import | catalog, DB, jobs, sharp, uploads volume |
| `cart` | Giỏ hàng phía client + tính tạm tính | — (client) |
| `checkout` | Tạo đơn, tính phí ship, sinh VietQR | catalog, shipping, orders |
| `orders` | Vòng đời đơn hàng, trạng thái | DB, jobs |
| `payments` | Webhook, đối soát, idempotency | orders, jobs |
| `shipping` | Tính phí ship theo vùng | DB (ShippingZone) |
| `auth` | Đăng nhập admin + RBAC (Better Auth) | DB |
| `jobs` | Định nghĩa & xử lý job pg-boss | DB, email, Zalo Bot API |
| `email` | Template React Email + gửi qua Resend | Resend |

## Môi trường & cấu hình

Biến môi trường chính: `APP_ENV`, `DATABASE_URL`, `POSTGRES_HOST_PORT`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `BOT_TOKEN`, `SEPAY_WEBHOOK_SECRET`, thông tin tài khoản ngân hàng nhận tiền (số TK, ngân hàng, tên) để sinh VietQR, `APP_BASE_URL`.

## Ranh giới catalog API

`src/server/catalog-api` xác thực token gắn với một user còn role `owner`,
chưa bị ban. Token không tạo tenant: scope `catalog:read` đọc được mọi sản phẩm
bằng ID hoặc search có cursor, kể cả sản phẩm không do token đó tạo. Asset
upload thuộc riêng token;
API chỉ nhận `assetId` và tự ánh xạ sang URL đã lưu.

Mutation khóa dòng token trong PostgreSQL, kiểm tra lại quyền rồi commit dữ
liệu, response idempotency và audit trong cùng transaction. Stock PATCH dùng
`expectedStock`; DELETE bảo vệ tham chiếu đơn hàng và danh mục đang dùng. Khi
gỡ ảnh qua PATCH, sửa/xóa variant hoặc DELETE product, cleanup được enqueue
cùng transaction và worker kiểm tra lại mọi tham chiếu trước khi xóa file.
Việc ghi file nằm
ngoài tính nguyên tử của PostgreSQL; lỗi thông thường dọn file chưa commit,
nhưng crash có thể để lại file không có asset record. File API có prefix
`catalog-`; cleanup chỉ dọn orphan thuộc prefix này sau 24 giờ và khi không còn
asset/product image tham chiếu. `catalog-maintenance` trong profile
`maintenance` dùng image migrate và cùng uploads volume để cấp, thu hồi token
hoặc dọn ảnh theo [runbook](08-production-runbook.md).

API production bắt buộc HTTPS và tin `X-Forwarded-Proto` từ reverse proxy.
Cloudflare Tunnel phải chuyển đúng protocol; app chỉ bind loopback để client
không thể bypass proxy bằng header tự gửi.
