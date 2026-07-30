# 02 — Tech stack

| Lớp | Lựa chọn | Lý do |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Full-stack 1 codebase, frontend React (dễ bảo trì), RSC cho SEO/tốc độ |
| ORM / DB | **Prisma + PostgreSQL** | Type-safe, migration tốt, AI viết mượt; Postgres dùng chung cho cả job queue |
| Background jobs | **pg-boss** (worker riêng) | Chạy trên Postgres sẵn có, **không cần Redis**; enqueue trong cùng transaction ghi đơn |
| Email | **Resend + React Email** | Template email viết bằng React (đồng bộ với frontend); free tier đủ; cần domain riêng để SPF/DKIM |
| Auth | **Better Auth** (v1.6.x) | Email/mật khẩu first-class + RBAC qua plugin; hợp shadcn (better-auth-ui) |
| UI component | **shadcn/ui + Tailwind** | Sở hữu code, không khóa vendor, dựng được bản sắc riêng (không "templated") |
| Bảng dữ liệu admin | **TanStack Table** | Bảng/sort/filter mạnh cho trang quản trị |
| Thanh toán | **VietQR + SePay/Casso** webhook | Đối soát chuyển khoản tự động + fallback admin xác nhận tay |
| State giỏ hàng | **Zustand + localStorage** | Giỏ hàng guest phía client, nhẹ |
| Deploy | **Komodo + Docker Compose** (app + worker + postgres) qua **Cloudflare Tunnel** | VPS hiện có Komodo và `cloudflared`; TLS ở Cloudflare, origin chỉ bind loopback |
| Test | **Vitest** (unit) + **Playwright** (E2E checkout) | TDD cho logic trọng điểm |

## Các quyết định đã cân nhắc (ghi lại lý do)

### Next.js vs Rails vs Rails-API+React
Dev quen React (1 năm) + Rails (1 năm). Ưu tiên **frontend React để bảo trì lâu dài** → chọn **Next.js full-stack** (React trong 1 codebase) thay vì Rails-API+React (2 app, nhiều glue) hay Rails+Hotwire (không phải React). Mối lo "Rails mạnh background job" được giải quyết bằng pg-boss.

### pg-boss vs BullMQ
Chọn **pg-boss** vì: dùng Postgres sẵn có (**không thêm Redis** → ít vận hành), **enqueue trong cùng transaction** với ghi đơn (đúng đắn cho luồng thanh toán), throughput thừa cho 50–100 đơn/ngày. BullMQ mạnh hơn ở throughput cực cao / flows phức tạp / dashboard sẵn — hiện chưa cần.

### Better Auth vs Auth.js (NextAuth)
Chọn **Better Auth** vì chỉ cần **email/mật khẩu cho admin + RBAC** (không cần social login). Better Auth có email/password first-class + plugin admin/access-control cho role+permission + better-auth-ui trên shadcn. Auth.js làm credentials cố tình tối giản (credentials + database session vướng) và RBAC phải tự chế. Auth.js chỉ vượt trội khi cần nhiều OAuth provider.

### shadcn/ui vs Mantine vs Tailwind thuần
Chọn **shadcn/ui + Tailwind**: sở hữu code component, không bị áp đặt diện mạo (Mantine dễ khiến web trông "templated"), hợp mục tiêu bản sắc riêng + dễ sửa. Admin data-grid bù bằng TanStack Table.

## Yêu cầu bắt buộc

- **Font phải hỗ trợ đầy đủ dấu tiếng Việt** (xem [05](05-design-direction.md)).
- **Domain riêng** để cấu hình SPF/DKIM cho Resend (email vào inbox). Trước khi có domain: dùng SMTP tạm/log email, không chặn tiến độ.
- Tài khoản **SePay** (hoặc Casso) trỏ về tài khoản ngân hàng nhận tiền; dùng môi trường sandbox trước.
