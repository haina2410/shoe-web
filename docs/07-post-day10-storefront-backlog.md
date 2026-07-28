# 07 — Storefront backlog sau Ngày 10

Document này giữ các action item storefront có giá trị nhưng không được đưa
vào MVP 10 ngày. Chỉ bắt đầu sau khi deploy/smoke test Ngày 10 ổn định.

## Ưu tiên 1 — Nội dung và độ tin cậy thật

- Thay logo SVG tạm bằng logo trong suốt/vector chính thức.
- Thay banner và ảnh seed AI/tạm bằng ảnh sản phẩm thật của cửa hàng.
- Chuẩn hoá bộ ảnh theo màu sản phẩm; các size cùng màu dùng chung gallery.
- Viết và công khai trang giao hàng, đổi trả, bảo mật và hướng dẫn thanh toán.
- Xác nhận URL Zalo chính thức và social profiles trước khi bật floating
  contact.
- Bổ sung Open Graph image, metadata và structured data Product/Organization.

## Ưu tiên 2 — Merchandising

- Thêm `compareAtPrice`/promotion model, thời gian hiệu lực và rule hiển thị
  trước khi có UI giảm giá.
- CMS/admin quản lý banner, collection và thứ tự sản phẩm nổi bật.
- Sản phẩm liên quan dựa trên category/màu/khoảng giá.
- Badge có nguồn dữ liệu thật: mới, sắp hết hàng, hết hàng.
- Carousel chỉ triển khai khi có ít nhất hai campaign asset thật và có owner
  nội dung; vẫn phải có navigation/search/category độc lập.

## Ưu tiên 3 — Retention và social proof

- Review/rating có moderation và xác minh đơn hàng.
- Wishlist.
- Tài khoản khách hàng và lịch sử đơn.
- Newsletter có consent, unsubscribe và provider rõ ràng.
- Social links/feed sau khi có tài khoản chính thức.
- Analytics ecommerce với chính sách cookie/privacy phù hợp.

## Ưu tiên 4 — Vận hành và hỗ trợ

- Floating Zalo/contact widget.
- Telegram/Zalo bot thông báo đơn mới và giao dịch cần review.
- Tích hợp GHN/GHTK, phí ship thật và tracking.
- Trang tự phục vụ yêu cầu đổi trả; giai đoạn đầu tiếp tục xử lý trực tiếp qua
  Zalo.
- Search nâng cao (`pg_trgm`, typo tolerance) khi catalog đủ lớn để cần.

## Điều kiện đưa một mục vào kế hoạch

Mỗi mục cần có:

1. owner nghiệp vụ và nội dung/dữ liệu thật;
2. tiêu chí thành công đo được;
3. design/spec riêng;
4. test và rollout plan tương ứng;
5. không làm suy yếu happy path checkout/payment hiện tại.

