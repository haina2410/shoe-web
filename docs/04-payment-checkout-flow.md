# 04 — Luồng checkout & thanh toán VietQR

## Tổng quan

Khách chuyển khoản qua **VietQR**. Hệ thống đối soát **tự động** qua webhook **SePay/Casso**, đồng thời cho admin **xác nhận tay** khi auto-match trượt.

## Luồng checkout (tạo đơn)

1. Khách bấm "Đặt hàng" từ giỏ (client) → **server action** `createOrder`.
2. Trong 1 transaction:
   - Kiểm tra tồn kho từng biến thể (`stock >= quantity`).
   - Tính `subtotal` (từ giá biến thể), `shippingFee` (theo tỉnh → zone), `total`.
   - Sinh `orderCode` duy nhất (VD `LEAF-8F3K2P`).
   - Tạo `Order` (status=`PENDING_PAYMENT`) + `OrderItem` (snapshot tên/giá).
   - **Enqueue job `send-order-confirmation`** (cùng transaction → không mất job).
3. Trả về trang thanh toán hiển thị **mã VietQR**.

## Sinh mã VietQR

- Nội dung chuyển khoản = **`orderCode`** (chốt để đối soát).
- Số tiền = `total`.
- Dùng thông tin tài khoản ngân hàng nhận tiền (từ env). Sinh ảnh QR theo chuẩn VietQR (qua `img.vietqr.io` hoặc endpoint QR của SePay).
- Trang hiển thị: QR, số TK, chủ TK, số tiền, nội dung CK, hướng dẫn "ghi đúng nội dung `orderCode`".

## Đối soát tự động (webhook SePay/Casso)

```
Khách CK ─► Ngân hàng ─► SePay phát hiện GD vào ─► POST /api/webhooks/sepay
                                                        │
   verify API key ─► parse (amount, content, txId) ─────┤
                                                        ▼
   tìm Order theo orderCode trong content + khớp amount
                                                        │
                    ┌──── khớp ────┐        ┌──── không khớp ────┐
                    ▼                        ▼
   TRANSACTION:                     ghi log "chưa khớp" để admin xử lý tay
     • Payment (txId unique)
     • Order.status = PAID, paidAt
     • trừ stock từng OrderItem
     • enqueue send-payment-confirmed
   trả 200
```

### Quy tắc quan trọng
- **Idempotency:** `Payment.transactionId` unique. Nếu webhook gọi lại cùng `txId` → bỏ qua, trả 200 (đã xử lý).
- **Verify nguồn:** kiểm tra API key/chữ ký SePay trước khi xử lý; từ chối nếu sai.
- **Khớp lỏng số tiền:** khớp chính xác `total`; nếu lệch → không auto-confirm, đẩy sang xử lý tay.
- **Trả 200 nhanh:** việc nặng (email) đẩy vào job, webhook chỉ ghi DB + enqueue.

## Xác nhận thủ công (fallback admin)

- Trang admin "Đơn chờ thanh toán" + trang "Giao dịch chưa khớp".
- Admin đối chiếu sao kê → bấm **"Xác nhận đã thanh toán"** cho đơn.
- Cùng logic transaction: tạo `Payment(provider="manual")`, `PAID`, trừ kho, enqueue email. Cũng idempotent (đơn đã PAID thì không xử lý lại).

## Jobs (pg-boss)

| Job | Kích hoạt | Việc |
|---|---|---|
| `send-order-confirmation` | khi tạo đơn | Email xác nhận đặt hàng + QR + hướng dẫn CK |
| `send-payment-confirmed` | khi đơn PAID | Email báo đã nhận thanh toán |
| `expire-unpaid` (cron) | định kỳ (VD mỗi 15') | Huỷ đơn `PENDING_PAYMENT` quá hạn (VD 24h) → `EXPIRED` |

- pg-boss lo **retry** email khi lỗi tạm thời.

## Email (React Email + Resend)

- **Đặt hàng thành công**: mã đơn, danh sách sản phẩm, tổng tiền, thông tin CK + QR, hướng dẫn.
- **Đã thanh toán**: xác nhận đã nhận tiền, tóm tắt đơn, bước tiếp theo.
- (Tuỳ chọn sau) **Đã giao/hoàn tất**.

## Vòng đời trạng thái đơn

```
PENDING_PAYMENT ──(thanh toán khớp/xác nhận tay)──► PAID ──► FULFILLED ──► COMPLETED
       │
       └──(quá hạn / admin huỷ)──► EXPIRED / CANCELLED
```
