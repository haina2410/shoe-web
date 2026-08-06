# 04 — Luồng checkout & thanh toán VietQR

## Tổng quan

Khách chuyển khoản qua **VietQR**. Hệ thống đối soát **tự động** qua webhook **SePay**, đồng thời cho `owner` và `staff` **xác nhận hoặc đối soát tay** khi auto-match trượt.

## Luồng checkout (tạo đơn)

1. Khách bấm "Đặt hàng" từ giỏ (client) → **server action** `createOrder`.
2. Trong 1 transaction:
   - Kiểm tra tồn kho từng biến thể (`stock >= quantity`).
   - Tính `subtotal` (từ giá biến thể), `shippingFee` (theo tỉnh → zone), `total`.
   - Sinh `orderCode` duy nhất (VD `LEAF8F3K2P`).
   - Tạo `Order` (status=`PENDING_PAYMENT`) + `OrderItem` (snapshot tên/giá).
   - **Enqueue job `send-order-confirmation`** (cùng transaction → không mất job).
3. Trả về trang thanh toán hiển thị **mã VietQR**.

## Sinh mã VietQR

- Nội dung chuyển khoản = **`orderCode`** (chốt để đối soát).
- `orderCode` có đúng định dạng liền nhau `LEAFXXXXXX`,
  regex `^LEAF[A-Z0-9]{6}$`.
- Phía SePay cấu hình payment code với prefix `LEAF` và suffix 6 ký tự
  alphanumeric.
- Số tiền = `total`.
- Dùng thông tin tài khoản ngân hàng nhận tiền (từ env). Sinh ảnh QR theo chuẩn VietQR (qua `img.vietqr.io` hoặc endpoint QR của SePay).
- Trang hiển thị: QR, số TK, chủ TK, số tiền, nội dung CK, hướng dẫn "ghi đúng nội dung `orderCode`".

## Đối soát tự động (webhook SePay)

```
Khách CK ─► Ngân hàng ─► SePay phát hiện GD vào ─► POST /api/webhooks/sepay
                                                        │
   verify HMAC raw body ─► parse (amount, code, id) ────┤
                                                        ▼
   lưu BankTransaction ─► tìm Order theo code + khớp amount
                                                        │
                    ┌──── khớp ────┐        ┌──── không khớp ────┐
                    ▼                        ▼
   TRANSACTION:                     BankTransaction.REVIEW_REQUIRED
     • Payment (payload.id unique)  được giữ lại để admin xử lý
     • Order.status = PAID, paidAt
     • trừ stock từng OrderItem
     • enqueue send-payment-confirmed
   trả 200 {"success":true}
```

### Quy tắc quan trọng
- **HMAC trên bytes gốc:** cấu hình `SEPAY_WEBHOOK_SECRET`; yêu cầu header `X-SePay-Timestamp` (Unix seconds) và `X-SePay-Signature: sha256=<hex>`. Chữ ký HMAC-SHA256 được tính trên đúng `<timestamp>.<raw request body>`, với cửa sổ thời gian 5 phút. Không stringify lại JSON trước khi verify.
- **Idempotency:** chuỗi của `payload.id` là `BankTransaction.providerTransactionId` và `Payment.transactionId` unique. Webhook lặp cùng `payload.id` là no-op an toàn.
- **Persist trước queue và match:** mọi event đã xác thực/hợp lệ được lưu cùng
  canonical `paymentCode`, amount và original JSON trước khi khởi tạo queue.
  Queue warm-up lỗi vẫn để lại đúng một event `RECEIVED`. Retry chỉ dùng các
  cột đã persist; body đến sau không thể đổi code/amount. Thiếu/sai mã đơn,
  lệch tiền, đơn không pending hoặc thiếu tồn kho được đánh dấu
  `REVIEW_REQUIRED`, không bị mất, để nhân viên xử lý.
- **Khớp số tiền nghiêm ngặt:** `transferAmount` phải bằng chính xác `Order.total`; nếu lệch thì không auto-confirm.
- **Acknowledge chính xác:** matched, duplicate và review-required đều trả HTTP 200 với body `{"success":true}`. Email được đẩy vào job; lỗi authentication/validation/hạ tầng trả failure tương ứng thay vì giả thành success.

## Xác nhận và đối soát thủ công

- `owner` và `staff` có quyền như nhau trên toàn bộ thao tác vận hành đơn hàng.
- Tại chi tiết đơn pending, admin có thể bấm **"Xác nhận thanh toán"**. Cùng
  logic transaction tạo `Payment(direction=IN, provider="manual")`, chuyển
  `PAID`, trừ kho và enqueue email. Đơn không còn pending không bị xử lý lại.
- Event không auto-match được giữ ở `BankTransaction.REVIEW_REQUIRED`, không
  bị xoá. Tại `/admin/bank-transactions/review`, admin nhập mã đơn canonical
  thật và bấm **"Ghép giao dịch"**.
- Ghép thủ công vẫn kiểm tra event đang chờ review, đơn tồn tại và còn pending,
  số tiền khớp chính xác, cùng tồn kho đủ. Thành công dùng lại luồng
  `markOrderPaid`, liên kết event với đơn và bỏ hàng khỏi danh sách review.
  Bất kỳ kiểm tra nào thất bại thì event vẫn là `REVIEW_REQUIRED` để thử lại.

## Sổ thanh toán và hoàn tiền

- `Payment.direction=IN` ghi tiền đã nhận; `OUT` ghi khoản hoàn. Các payment
  có từ trước được coi là `IN`.
- Giao diện suy ra `totalIn`, `totalOut`, `netReceived = totalIn - totalOut`
  và tình trạng: chưa hoàn (`OUT = 0`), hoàn một phần
  (`0 < OUT < IN`), hoàn toàn bộ (`OUT = IN`).
- Chỉ đơn `PAID`, `FULFILLED` hoặc `COMPLETED` có tiền vào mới được ghi hoàn.
  Tổng `OUT` cộng dồn không thể vượt `IN`, kể cả hai thao tác đồng thời.
  `Order.lastRefundAt` chỉ cập nhật sau khoản hoàn thành công.
- Hoàn tiền là thao tác ghi sổ thủ công: hệ thống **không thực hiện chuyển
  khoản ngân hàng**, không thay đổi trạng thái đơn và không tự hoàn tồn kho.

## Jobs (pg-boss)

| Job | Kích hoạt | Việc |
|---|---|---|
| `send-order-confirmation` | khi tạo đơn | Email xác nhận đặt hàng + QR + hướng dẫn CK |
| `send-payment-confirmed` | khi đơn PAID | Email báo đã nhận thanh toán |
| `expire-unpaid` (cron) | định kỳ (VD mỗi 15') | Huỷ đơn `PENDING_PAYMENT` quá hạn (VD 24h) → `EXPIRED` |

- Worker xử lý cả hai queue email, đồng thời đăng ký lịch `expire-unpaid` mỗi 15 phút theo UTC. pg-boss lo **retry/backoff** email khi lỗi tạm thời; expiry dùng update có điều kiện nên chạy lặp an toàn.

## Email (React Email + Resend)

- **Đặt hàng thành công**: mã đơn, danh sách sản phẩm, tổng tiền, thông tin CK + QR, hướng dẫn.
- **Đã thanh toán**: xác nhận đã nhận tiền, tóm tắt đơn, bước tiếp theo.
- Email **đã thanh toán** dùng Resend idempotency key
  `payment-confirmed:<orderCode>` để provider retry không gửi trùng.
- (Tuỳ chọn sau) **Đã giao/hoàn tất**.

## Vòng đời trạng thái đơn

```
PENDING_PAYMENT ──(thanh toán khớp/xác nhận tay)──► PAID ──(admin)──► FULFILLED ──(admin)──► COMPLETED
       │
       ├──(admin)──► CANCELLED
       └──(job hết hạn)──► EXPIRED
```

Ma trận chuyển trạng thái do admin:

| Từ | Đích hợp lệ | Ghi chú |
|---|---|---|
| `PENDING_PAYMENT` | `CANCELLED` | `PAID` chỉ đến từ luồng xác nhận thanh toán |
| `PAID` | `FULFILLED` | bị chặn nếu `netReceived = 0` (đã hoàn toàn bộ) |
| `FULFILLED` | `COMPLETED` | hoàn tất giao hàng |
| `COMPLETED` | không có | trạng thái cuối |
| `CANCELLED` | không có | trạng thái cuối |
| `EXPIRED` | không có | trạng thái cuối |

Khoản hoàn một phần hoặc toàn bộ không tự chuyển trạng thái. Vì vậy một đơn đã
`COMPLETED` vẫn giữ nguyên `COMPLETED` sau khi ghi nhận hoàn tiền.
