# leafshoes — Lộ trình triển khai cuốn chiếu (TDD)

Kế hoạch làm **cuốn chiếu từng ngày**: mỗi ngày là một "lát cắt" hoàn chỉnh, **test được độc lập** trước khi sang ngày sau. Mỗi ngày có plan chi tiết riêng (TDD: red → green → refactor → commit), viết **ngay trước khi bắt đầu ngày đó** để bám sát code thực tế đã có.

Spec nguồn: [../README.md](../README.md) và các file `01`–`06`.

## Nguyên tắc chung

- **TDD:** mỗi tính năng bắt đầu bằng test đỏ → code tối thiểu cho xanh → refactor. Không viết code trước test cho logic nghiệp vụ.
- **Cổng test cuối ngày (bắt buộc xanh mới sang ngày sau):** `npm run test` (Vitest), `npm run build`, và E2E liên quan (Playwright) nếu có.
- **Commit thường xuyên**, mỗi task một commit.
- **Tiền = số nguyên VND**. **Font đủ dấu tiếng Việt**. **TypeScript strict**.

## Lộ trình & cổng test

| Ngày | Lát cắt | Test gate (bằng chứng "xong") | Plan chi tiết |
|---|---|---|---|
| **1** | Nền tảng: scaffold Next.js+TS, Tailwind+shadcn, Postgres(Docker)+Prisma, Better Auth+RBAC, Vitest+Playwright, design tokens | `npm test` xanh (có test thật), `npm run build` ok, `prisma migrate` ok, Playwright smoke trang chủ pass | [2026-07-22-day1-foundation.md](2026-07-22-day1-foundation.md) |
| **2** | Data model đầy đủ + seed + RBAC guard | Unit test schema/seed; test middleware chặn non-admin; `prisma migrate` + seed chạy | *viết khi bắt đầu Ngày 2* |
| **3** | Admin CRUD sản phẩm/biến thể/tồn kho + upload ảnh | Unit test server actions CRUD; E2E admin tạo sản phẩm + biến thể | *cuốn chiếu* |
| **4** | Storefront: danh mục, lọc, search, chi tiết | Unit test bộ lọc/search; E2E duyệt danh mục → mở chi tiết | *cuốn chiếu* |
| **5** | Giỏ hàng + checkout + phí ship theo vùng + sinh VietQR | Unit test tính subtotal/ship/total + sinh orderCode; E2E đặt hàng → thấy QR | *cuốn chiếu* |
| **6** | pg-boss worker + React Email + email xác nhận đặt hàng | Unit test handler job; test render email; đặt hàng → email gửi (mock) | *cuốn chiếu* |
| **7** | Webhook SePay + đối soát + idempotency + xác nhận tay + cron hết hạn | Unit test khớp/lệch/lặp webhook; test trừ kho; E2E webhook → PAID | *cuốn chiếu* |
| **8** | Admin quản lý đơn (list/detail/đổi trạng thái) + giao dịch chưa khớp | Unit test chuyển trạng thái hợp lệ; E2E admin xác nhận + fulfill đơn | *cuốn chiếu* |
| **9** | Polish thiết kế, responsive, a11y, empty/error states, signature "lá" | E2E happy path xanh trên mobile+desktop; kiểm tra focus/reduced-motion | *cuốn chiếu* |
| **10** | Dockerize (app+worker+postgres) + reverse proxy TLS + deploy + smoke E2E trên server | Checkout end-to-end chạy trên server thật | *cuốn chiếu* |

## Quy trình mỗi ngày

1. Mình viết plan chi tiết ngày đó (`docs/plans/<ngày>.md`) với task TDD từng bước.
2. Thực thi task-by-task (subagent-driven hoặc inline).
3. Chạy cổng test cuối ngày → phải xanh.
4. Sang ngày kế: quay lại bước 1.
