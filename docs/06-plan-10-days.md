# 06 — Kế hoạch triển khai 10 ngày (high-level)

Mục tiêu: **demo chạy được end-to-end** (browse → giỏ → checkout → QR → đối soát → email → admin quản lý đơn), không phải sản phẩm hoàn chỉnh. Làm cặp với AI agent, theo **TDD** và **cuốn chiếu**: mỗi ngày là một lát cắt test được độc lập; plan chi tiết từng bước viết ngay trước khi bắt đầu ngày đó (xem `docs/plans/`).

## Nguyên tắc xuyên suốt

- **TDD:** logic nghiệp vụ bắt đầu bằng test đỏ → code tối thiểu → refactor.
- **Cổng test cuối ngày** (bắt buộc xanh mới sang ngày sau): `npm run test`, `npm run build`, E2E liên quan.
- **Tiền = số nguyên VND**; **font đủ dấu tiếng Việt**; **TypeScript strict**; commit mỗi task.

## Thứ tự phụ thuộc

```
Nền tảng(1) → Data+RBAC(2) → Admin CRUD(3) ─┐
                             Storefront(4) ──┼→ Checkout+QR(5) → Jobs/Email(6) → Webhook(7) → Admin orders(8) → Polish(9) → Deploy(10)
```

---

## Ngày 1 — Nền tảng

- **Mục tiêu:** khung chạy được + test harness thật.
- **Bàn giao:** scaffold Next.js+TS; Vitest+Playwright; **Postgres local (Homebrew)** + Prisma; Better Auth + RBAC (OWNER/STAFF); design tokens + font Be Vietnam Pro + header/footer. *(Docker chỉ dùng cho production — Ngày 10.)*
- **Module/file chính:** `src/lib/money.ts`, `src/lib/prisma.ts`, `src/lib/permissions.ts`, `src/lib/auth.ts`, `src/app/api/auth/[...all]/route.ts`, `src/app/layout.tsx`.
- **Trọng tâm test:** unit `formatVnd`; kết nối Prisma; định nghĩa role; render header; smoke E2E trang chủ.
- **Phụ thuộc:** không. | **Rủi ro:** import adapter Better Auth có thể đổi (theo output CLI).
- **Plan chi tiết:** [plans/2026-07-22-day1-foundation.md](plans/2026-07-22-day1-foundation.md).

## Ngày 2 — Data model đầy đủ + seed + guard RBAC

- **Mục tiêu:** toàn bộ schema nghiệp vụ + dữ liệu mẫu + chặn truy cập admin theo role.
- **Bàn giao:** Prisma models (Category, Product, ProductImage, Variant, Order, OrderItem, Payment, ShippingZone, ProvinceZone) + migration; script seed (danh mục, vài sản phẩm có biến thể size/màu, zone phí ship 63 tỉnh); middleware/guard chặn non-admin vào `(admin)`.
- **Module/file chính:** `prisma/schema.prisma`, `prisma/seed.ts`, `src/middleware.ts`, `src/lib/rbac.ts` (helper kiểm tra quyền).
- **Trọng tâm test:** unit helper `can(user, action, resource)`; test seed tạo đúng số bản ghi; test guard redirect non-admin.
- **Phụ thuộc:** Ngày 1. | **Rủi ro:** map 63 tỉnh → zone tốn công (chuẩn bị sẵn danh sách tỉnh + zone mặc định).

## Ngày 3 — Admin CRUD sản phẩm/biến thể/tồn kho

- **Mục tiêu:** admin quản lý danh mục sản phẩm end-to-end.
- **Bàn giao:** trang `(admin)/products` (list TanStack Table, sort/filter), form tạo/sửa sản phẩm + nhiều biến thể (size/màu/giá/tồn), xoá; upload ảnh (local disk hoặc S3-compatible); chỉnh nhanh tồn kho.
- **Module/file chính:** `src/app/(admin)/products/*`, `src/server/actions/products.ts`, `src/server/actions/variants.ts`, `src/lib/upload.ts`, `src/components/admin/*`.
- **Trọng tâm test:** unit server actions (tạo sản phẩm sinh slug duy nhất; validate giá/tồn ≥ 0; SKU unique); E2E admin tạo sản phẩm + biến thể rồi thấy trong list.
- **Phụ thuộc:** Ngày 2. | **Rủi ro:** xử lý ảnh (giữ đơn giản: lưu file + đường dẫn).

## Ngày 4 — Storefront: duyệt sản phẩm

- **Mục tiêu:** khách duyệt, lọc, tìm, xem chi tiết.
- **Bàn giao:** trang chủ (hero product-forward), trang danh mục + **lọc** (giá/size/màu), **search** theo tên, **trang chi tiết** (ảnh, chọn size/màu, hiển thị tồn kho, mô tả).
- **Module/file chính:** `src/app/page.tsx`, `src/app/products/*`, `src/server/queries/catalog.ts`, `src/components/product-card.tsx`, `src/components/filters.tsx`.
- **Trọng tâm test:** unit query lọc/search (khớp giá/size/màu; search không phân biệt hoa thường/dấu); E2E duyệt danh mục → mở chi tiết → thấy biến thể.
- **Phụ thuộc:** Ngày 2 (data), Ngày 3 (có sản phẩm để hiển thị). | **Rủi ro:** search tiếng Việt có dấu (chuẩn hoá khi so khớp).

## Ngày 5 — Giỏ hàng + checkout + phí ship + VietQR

- **Mục tiêu:** khách đặt hàng (guest) và thấy mã QR thanh toán.
- **Bàn giao:** giỏ hàng (Zustand+localStorage, sửa số lượng), trang checkout (form địa chỉ tỉnh/huyện/xã + email), tính **phí ship theo vùng**, tạo `Order` + `OrderItem` (server action, trong transaction), **sinh VietQR** + trang hiển thị hướng dẫn CK.
- **Module/file chính:** `src/lib/cart.ts` (store), `src/app/cart/*`, `src/app/checkout/*`, `src/server/actions/checkout.ts`, `src/lib/shipping.ts`, `src/lib/order-code.ts`, `src/lib/vietqr.ts`.
- **Trọng tâm test:** unit tính subtotal/shipping/total; sinh `orderCode` duy nhất; kiểm tra tồn kho tại checkout; build chuỗi VietQR đúng định dạng; E2E đặt hàng → thấy QR + đúng số tiền.
- **Phụ thuộc:** Ngày 4 (giỏ từ sản phẩm), Ngày 2 (Order/zone). | **Rủi ro:** đúng chuẩn nội dung CK = orderCode để đối soát khớp.

## Ngày 6 — Worker pg-boss + email đặt hàng

- **Mục tiêu:** gửi email xác nhận đặt hàng qua job nền.
- **Bàn giao:** tiến trình `worker.ts` chạy pg-boss; đăng ký job `send-order-confirmation`; enqueue trong transaction tạo đơn (Ngày 5); template React Email "đặt hàng thành công" (kèm QR + hướng dẫn); gửi qua Resend (dev: log/SMTP tạm nếu chưa có domain).
- **Module/file chính:** `src/worker/index.ts`, `src/jobs/queue.ts`, `src/jobs/handlers/send-order-confirmation.ts`, `src/emails/order-confirmation.tsx`, `src/lib/mailer.ts`.
- **Trọng tâm test:** unit handler job (được gọi với payload đúng, render email không lỗi); test enqueue được trigger khi tạo đơn (mock queue); test render template ra HTML chứa orderCode.
- **Phụ thuộc:** Ngày 5. | **Rủi ro:** email vào spam (chưa domain) → giai đoạn dev dùng log/preview.

## Ngày 7 — Webhook SePay + đối soát + xác nhận tay + cron hết hạn

- **Mục tiêu:** thanh toán tự động chuyển đơn sang PAID + fallback tay.
- **Bàn giao:** route `/api/webhooks/sepay` verify HMAC-SHA256 trên đúng `<timestamp>.<raw body>` bằng `SEPAY_WEBHOOK_SECRET`, parse payload chính thức, persist event trước queue rồi chỉ khớp từ canonical `paymentCode` + amount đã lưu, idempotent theo `payload.id`; giao dịch không khớp được giữ ở `BankTransaction.REVIEW_REQUIRED` cho Ngày 8. Mã payment dùng `LEAFXXXXXX`; cấu hình SePay prefix `LEAF`, suffix 6 ký tự alphanumeric. Trong transaction: tạo `Payment`, `Order→PAID`, **trừ tồn kho**, enqueue `send-payment-confirmed`; nút owner "Xác nhận đã thanh toán". Worker xử lý cả hai queue email và đăng ký cron `expire-unpaid` mỗi 15 phút (đơn pending quá 24 giờ).
- **Module/file chính:** `src/app/api/webhooks/sepay/route.ts`, `src/server/payments/reconcile-sepay.ts`, `src/server/payments/mark-order-paid.ts`, `src/jobs/handlers/send-payment-confirmed.ts`, `src/jobs/handlers/expire-unpaid.ts`, `src/emails/payment-confirmed.tsx`.
- **Trọng tâm test:** HMAC exact raw JSON; đối soát khớp đúng; sai/missing code và lệch tiền được persist để review; webhook lặp cùng `payload.id` là no-op; test trừ tồn kho chính xác; E2E ký webhook thật → refresh thấy đơn PAID và không còn QR.
- **Phụ thuộc:** Ngày 5, 6. | **Rủi ro:** khác biệt payload sandbox vs production (giữ verify + test bằng payload mẫu).

## Ngày 8 — Admin quản lý đơn hàng ✅

- **Trạng thái:** hoàn thành.
- **Mục tiêu:** admin xử lý trọn vòng đời đơn.
- **Bàn giao:** list đơn có lọc trạng thái/mã đơn/đơn có hoàn tiền; chi tiết
  đơn và sổ `IN/OUT`; xác nhận payment; máy trạng thái
  `PENDING_PAYMENT→CANCELLED`, `PAID→FULFILLED→COMPLETED`; ghi nhận hoàn tiền
  một phần/toàn bộ; màn hình ghép thủ công event `REVIEW_REQUIRED`. `owner` và
  `staff` có quyền vận hành đơn như nhau.
- **Module/file chính:** `src/app/admin/orders/*`,
  `src/app/admin/bank-transactions/review/page.tsx`,
  `src/server/actions/order-status.ts`, `src/server/actions/refunds.ts`,
  `src/server/actions/bank-transactions.ts`, `src/lib/order-status.ts`.
- **Trọng tâm test:** unit/integration máy trạng thái, phân quyền cả hai role,
  refund đồng thời và guard hoàn toàn bộ; E2E staff xác nhận → fulfill →
  complete → hoàn một phần, cùng luồng ghép event review vào đơn pending.
- **Phụ thuộc:** Ngày 7. | **Rủi ro:** phân quyền STAFF vs OWNER cho hành động nhạy cảm (dùng RBAC Ngày 2).

## Ngày 9 — Polish thiết kế + a11y + trạng thái rỗng/lỗi

- **Mục tiêu:** giao diện chỉn chu, đáng tin, đúng hướng thiết kế.
- **Trạng thái:** ✅ Hoàn thành.
- **Bàn giao:** homepage theo thứ tự banner tĩnh tuyển chọn → danh mục → sản
  phẩm nổi bật → dải cam kết → footer doanh nghiệp; asset banner và sáu ảnh
  sản phẩm tạm thời, có thể thay thế; storefront và admin responsive
  mobile→desktop; skip link, focus bàn phím và `prefers-reduced-motion`;
  empty/error states; E2E cùng visual QA ở `390×844` và `1440×1000`.
- **Giới hạn đã chốt:** không có giảm giá và không có carousel trong Ngày 9.
- **Module/file chính:** `src/components/*` (tinh chỉnh), `src/app/**` (layout/spacing), asset motif lá.
- **Trọng tâm test:** E2E happy path xanh trên viewport mobile + desktop; kiểm tra thủ công focus/contrast.
- **Phụ thuộc:** Ngày 3–8 (có UI để polish). | **Rủi ro:** sa đà polish → giữ trong 1 ngày, ưu tiên happy path.

## Ngày 10 — Dockerize + deploy dedicated server

- **Mục tiêu:** demo chạy trên server thật.
- **Bàn giao:** `Dockerfile` nhiều stage (Next.js standalone + worker + migrate), Docker Compose do Komodo quản lý (app + worker + postgres + migration job), app chỉ bind loopback và đi qua `cloudflared` system service đã có, biến môi trường production, healthcheck, backup/rollback runbook và **smoke test E2E trên server**; buffer cho lỗi phát sinh.
- **Module/file chính:** `Dockerfile`, `docker-compose.prod.yml`, `.env.production.example`, script deploy/backup/smoke, production runbook.
- **Trọng tâm test:** smoke không phá dữ liệu trên domain thật; manual acceptance checkout + VietQR + webhook SePay + email thật sau khi domain/DKIM sẵn sàng.
- **Phụ thuộc:** tất cả. | **Rủi ro:** Cloudflare Tunnel origin, webhook URL, migration, persistent volume và biến môi trường thiếu → checklist trước deploy.

---

## Chiến lược test tổng thể

- **Unit (Vitest):** logic thuần & nghiệp vụ — tiền/phí ship/tổng đơn, sinh orderCode, RBAC `can()`, đối soát + idempotency webhook, trừ tồn kho, máy trạng thái đơn, query lọc/search.
- **E2E (Playwright):** các luồng người dùng chính — duyệt→chi tiết, checkout→QR, webhook→PAID, admin xác nhận+fulfill.
- **Cổng cuối ngày:** `npm run test` + `npm run build` + E2E liên quan phải xanh.

## Rủi ro & cách giảm (toàn dự án)

| Rủi ro | Giảm thiểu |
|---|---|
| Email vào spam (chưa domain/DKIM) | Dev log/SMTP tạm; cấu hình Resend + domain trước Ngày 10 |
| SePay sandbox khác production | Test webhook bằng payload mẫu; giữ HMAC raw-body verification và cấu hình payment-code prefix/suffix giống production |
| Trễ do polish giao diện | Polish gói gọn Ngày 9; các ngày trước ưu tiên chức năng |
| Sai nội dung CK của khách | Fallback admin xác nhận tay + trang giao dịch chưa khớp |
| Tồn kho âm khi mua đồng thời | Kiểm tra + trừ kho trong transaction lúc PAID |
| Map 63 tỉnh → zone tốn thời gian | Chuẩn bị danh sách sẵn + zone mặc định cho tỉnh chưa map |

## Ngoài phạm vi (YAGNI cho demo)

Tích hợp GHN/GHTK, tài khoản khách hàng, đánh giá sản phẩm, mã giảm giá/khuyến mãi, đa ngôn ngữ, analytics nâng cao.

## Chuẩn bị trước khi bắt đầu

- Domain riêng (cho Resend) — hoặc chấp nhận log email tạm giai đoạn đầu.
- Tài khoản SePay/Casso + tài khoản ngân hàng nhận tiền.
- Thông tin ngân hàng để sinh VietQR (số TK, mã ngân hàng, tên chủ TK).
- Danh sách 63 tỉnh + phân nhóm zone phí ship.
