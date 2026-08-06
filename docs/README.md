# leafshoes Việt Nam — Tài liệu dự án

Website bán giày (e-commerce) cho **leafshoes Việt Nam**. Thư mục này chỉ giữ
tài liệu tham chiếu bền vững về kiến trúc, nghiệp vụ, giao diện và vận hành.

## Phạm vi tính năng (MVP demo)

- **Browse:** danh mục + lọc (giá/size/màu), tìm kiếm theo tên, trang chi tiết sản phẩm, giỏ hàng nhiều sản phẩm.
- **Quản lý sản phẩm (admin):** CRUD sản phẩm/biến thể/tồn kho, upload ảnh; nhiều admin có phân quyền (RBAC).
- **Thanh toán:** chuyển khoản QR VietQR, đối soát tự động qua SePay/Casso + admin xác nhận tay khi cần; checkout tạo đơn; gửi email xác nhận.
- **Mua không cần đăng nhập:** guest checkout chỉ bằng email.

## Quy mô & hạ tầng

- ~50–100 đơn/ngày.
- Deploy trên **dedicated server** bằng Docker Compose.

## Cấu trúc

- `01`–`03`: kiến trúc, lựa chọn công nghệ và dữ liệu nền.
- `04` và `06`: invariant nghiệp vụ thanh toán, đối soát và vận hành đơn.
- `05` và `07`: hệ thống giao diện cùng backlog sản phẩm.
- `08`: runbook production dành cho người vận hành.

Tài liệu dùng tên ổn định theo chủ đề, không lưu nhật ký triển khai theo ngày.

## Mục lục tài liệu

| File | Nội dung |
|---|---|
| [01-overview-architecture.md](01-overview-architecture.md) | Tổng quan kiến trúc, sơ đồ, các thành phần |
| [02-tech-stack.md](02-tech-stack.md) | Tech stack + lý do chọn (kèm các so sánh đã cân) |
| [03-data-model.md](03-data-model.md) | Mô hình dữ liệu (Prisma), trạng thái đơn |
| [04-payment-checkout-flow.md](04-payment-checkout-flow.md) | Luồng checkout + thanh toán VietQR + webhook |
| [05-design-direction.md](05-design-direction.md) | Hướng thiết kế thương hiệu (tối giản, "leaf") |
| [06-admin-order-domain.md](06-admin-order-domain.md) | Vòng đời đơn, phân quyền, đối soát và hoàn tiền |
| [07-post-day10-storefront-backlog.md](07-post-day10-storefront-backlog.md) | Backlog storefront cần dữ liệu hoặc phạm vi bổ sung |
| [08-production-runbook.md](08-production-runbook.md) | Deploy, backup, rollback và xử lý sự cố production |

## Ngoài phạm vi demo (YAGNI)

Tích hợp hãng vận chuyển (GHN/GHTK), tài khoản khách hàng, đánh giá sản phẩm, mã giảm giá/khuyến mãi, đa ngôn ngữ.

Các implementation plan do công cụ tạo dưới `docs/plans/` và
`docs/superpowers/` không thuộc tài liệu dự án và được Git bỏ qua.
