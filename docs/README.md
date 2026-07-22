# leafshoes Việt Nam — Tài liệu dự án

Website bán giày (e-commerce) cho **leafshoes Việt Nam**. Mục tiêu 10 ngày: **demo chạy được end-to-end**, không phải sản phẩm hoàn chỉnh cuối cùng.

## Phạm vi tính năng (MVP demo)

- **Browse:** danh mục + lọc (giá/size/màu), tìm kiếm theo tên, trang chi tiết sản phẩm, giỏ hàng nhiều sản phẩm.
- **Quản lý sản phẩm (admin):** CRUD sản phẩm/biến thể/tồn kho, upload ảnh; nhiều admin có phân quyền (RBAC).
- **Thanh toán:** chuyển khoản QR VietQR, đối soát tự động qua SePay/Casso + admin xác nhận tay khi cần; checkout tạo đơn; gửi email xác nhận.
- **Mua không cần đăng nhập:** guest checkout chỉ bằng email.

## Quy mô & hạ tầng

- ~50–100 đơn/ngày.
- Deploy trên **dedicated server** bằng Docker Compose.

## Mục lục tài liệu

| File | Nội dung |
|---|---|
| [01-overview-architecture.md](01-overview-architecture.md) | Tổng quan kiến trúc, sơ đồ, các thành phần |
| [02-tech-stack.md](02-tech-stack.md) | Tech stack + lý do chọn (kèm các so sánh đã cân) |
| [03-data-model.md](03-data-model.md) | Mô hình dữ liệu (Prisma), trạng thái đơn |
| [04-payment-checkout-flow.md](04-payment-checkout-flow.md) | Luồng checkout + thanh toán VietQR + webhook |
| [05-design-direction.md](05-design-direction.md) | Hướng thiết kế thương hiệu (tối giản, "leaf") |
| [06-plan-10-days.md](06-plan-10-days.md) | Kế hoạch triển khai 10 ngày + phạm vi/rủi ro/test |

## Ngoài phạm vi demo (YAGNI)

Tích hợp hãng vận chuyển (GHN/GHTK), tài khoản khách hàng, đánh giá sản phẩm, mã giảm giá/khuyến mãi, đa ngôn ngữ.

---
*Tài liệu tạo ngày 2026-07-22 qua quá trình brainstorming.*
