# 01 — Tổng quan kiến trúc

## Nguyên tắc

Một **Next.js app (App Router) duy nhất** phục vụ storefront + admin + API routes, cộng **một tiến trình worker** riêng chạy pg-boss dùng chung codebase & database. Tất cả đóng gói bằng Docker Compose trên một dedicated server.

Lý do monolith 1 codebase: nhanh nhất cho demo 10 ngày, một ngôn ngữ (TypeScript), frontend React (dễ bảo trì về sau), tránh glue code giữa nhiều app.

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
└──────────────────────────────────────────────────────────────────────────────────┘
        ▲                                    ▲
   Khách (guest, chỉ email)            SePay/Casso webhook (khớp CK ngân hàng)
```

Production dùng `cloudflared` system service đã có trên VPS để kết thúc HTTPS
ở Cloudflare và chuyển request tới app bind trên loopback. Stack không cần
Caddy/Nginx và không mở origin web hoặc PostgreSQL ra Internet.

## Các thành phần

### 1. Storefront (khách hàng)
- Dùng **React Server Components** cho danh sách/chi tiết sản phẩm (SEO + tải nhanh).
- **Giỏ hàng giữ ở client** (localStorage, state qua Zustand) — không cần đăng nhập. Chỉ khi checkout mới gửi giỏ lên server để tạo đơn.
- Checkout: form thông tin nhận hàng + email (guest).

### 2. Admin (quản trị)
- Route nhóm `(admin)` được bảo vệ bằng **Better Auth** (email/mật khẩu) + **RBAC** (role OWNER/STAFF).
- Quản lý sản phẩm/biến thể/tồn kho, quản lý đơn hàng, xác nhận thanh toán thủ công.
- UI bảng dữ liệu bằng **TanStack Table** trên nền shadcn/ui.

### 3. API routes
- `/api/webhooks/sepay` — nhận webhook đối soát ngân hàng từ SePay/Casso.
- Server Actions cho mutation (tạo đơn, cập nhật tồn kho...) thay cho nhiều REST endpoint.

### 4. Worker (pg-boss)
- Tiến trình Node riêng (`worker.ts`), cùng repo, kết nối cùng Postgres.
- Xử lý job: gửi email (đặt hàng, đã thanh toán), đối soát, cron **hết hạn đơn chưa thanh toán**.
- **Enqueue job nằm trong cùng transaction** với thao tác ghi đơn hàng → không mất job, không double-processing (xem [04](04-payment-checkout-flow.md)).

## Ranh giới module (để dễ hiểu & test độc lập)

| Module | Chức năng | Phụ thuộc |
|---|---|---|
| `catalog` | Sản phẩm, biến thể, danh mục, tồn kho | DB |
| `cart` | Giỏ hàng phía client + tính tạm tính | — (client) |
| `checkout` | Tạo đơn, tính phí ship, sinh VietQR | catalog, shipping, orders |
| `orders` | Vòng đời đơn hàng, trạng thái | DB, jobs |
| `payments` | Webhook, đối soát, idempotency | orders, jobs |
| `shipping` | Tính phí ship theo vùng | DB (ShippingZone) |
| `auth` | Đăng nhập admin + RBAC (Better Auth) | DB |
| `jobs` | Định nghĩa & xử lý job pg-boss | DB, email |
| `email` | Template React Email + gửi qua Resend | Resend |

## Môi trường & cấu hình

Biến môi trường chính: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `SEPAY_WEBHOOK_API_KEY`, thông tin tài khoản ngân hàng nhận tiền (số TK, ngân hàng, tên) để sinh VietQR, `APP_URL`.
