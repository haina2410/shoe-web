# 06 — Nghiệp vụ vận hành đơn hàng

Tài liệu này mô tả các invariant mà UI, Server Action và transaction core phải
cùng tuân thủ. Trạng thái hiển thị trên client không phải security boundary;
mọi mutation phải xác thực quyền, validate input và đọc lại dữ liệu từ DB.

## Vòng đời đơn

```text
PENDING_PAYMENT ──(nhận tiền)──► PAID ──► FULFILLED ──► COMPLETED
       │
       ├──(nhân viên huỷ)──────► CANCELLED
       └──(cron quá hạn)───────► EXPIRED
```

- `FULFILLED` nghĩa là cửa hàng đã bàn giao cho đơn vị vận chuyển.
- `COMPLETED`, `CANCELLED` và `EXPIRED` là terminal.
- `PENDING_PAYMENT → PAID` chỉ đi qua payment core; mutation trạng thái thông
  thường không được giả lập thanh toán.
- `PAID → FULFILLED` bị chặn khi tiền nhận ròng bằng `0`.
- Hoàn tiền không đổi trạng thái đơn. Không có trạng thái `REFUNDED`.

Module `src/lib/order-status.ts` giữ nhãn tiếng Việt, bảng transition,
`canTransitionOrder` và danh sách trạng thái đích cho UI. Core đổi trạng thái
khóa row đơn, đọc lại trạng thái và update có điều kiện trong transaction.

## Phân quyền

`owner` và `staff` đều có `order:update` để:

- xác nhận thanh toán thủ công;
- ghép giao dịch SePay chưa khớp;
- huỷ đơn còn chờ thanh toán;
- chuyển `PAID → FULFILLED → COMPLETED`;
- ghi nhận khoản hoàn `OUT`.

Mỗi Server Action gọi `requireAdmin()`, parse input theo allow-list và lấy trạng
thái, số tiền cùng actor từ nguồn tin cậy. Ẩn nút trên UI không thay thế authz.

## Payment ledger và hoàn tiền

`Payment` là ledger bất biến:

```text
IN  = tiền cửa hàng đã nhận
OUT = tiền cửa hàng đã chuyển trả khách
```

- `amount` là số nguyên VND dương; hướng tiền nằm ở `direction`.
- Một đơn có thể có nhiều khoản `OUT`.
- Chỉ đơn `PAID`, `FULFILLED` hoặc `COMPLETED` có tiền `IN` mới được ghi hoàn.
- Tổng `OUT` không được vượt tổng `IN`, kể cả khi hai yêu cầu chạy đồng thời.
- Tạo `OUT` và cập nhật `Order.lastRefundAt` nằm trong cùng transaction.
- Hoàn tiền không tự chuyển khoản ngân hàng, đổi trạng thái hoặc cộng tồn kho.
- Ledger không có thao tác sửa/xoá trong MVP.

Trạng thái hoàn tiền được dẫn xuất từ tổng ledger:

| Điều kiện | Trạng thái |
|---|---|
| `totalOut = 0` | Chưa hoàn |
| `0 < totalOut < totalIn` | Đã hoàn một phần |
| `totalOut = totalIn` | Đã hoàn toàn bộ |

Core hoàn tiền khóa row đơn, aggregate `IN/OUT`, kiểm tra số dư rồi tạo payment
`OUT` với transaction ID sinh ở server, actor và reference/note tùy chọn.

## Đối soát giao dịch cần review

Giao dịch `REVIEW_REQUIRED` không bị xoá hoặc đổi lại `RECEIVED`. Nhân viên cung
cấp `bankTransactionId` và mã đơn canonical `^LEAF[A-Z0-9]{6}$`; transaction
core phải:

1. claim đúng event đang chờ review;
2. yêu cầu đơn còn `PENDING_PAYMENT`;
3. yêu cầu amount bằng chính xác `Order.total` và tồn kho còn đủ;
4. dùng payment core chung để tạo `IN`, trừ kho, lưu actor và enqueue email;
5. liên kết event với đơn rồi chuyển event thành `MATCHED`.

Sai mã, lệch tiền, thiếu tồn hoặc race phải giữ event ở `REVIEW_REQUIRED` để có
thể kiểm tra và thử lại.

## Bề mặt admin

- `/admin/orders`: mới nhất trước, lọc trạng thái/refund, tìm theo `orderCode`,
  tối đa 100 bản ghi mỗi bộ lọc.
- `/admin/orders/[id]`: customer, item snapshot, tổng tiền, ledger, bank
  transaction, transition hợp lệ và form hoàn tiền.
- `/admin/bank-transactions/review`: event cũ nhất trước, reason và form ghép
  mã đơn; không hiển thị raw JSON đầy đủ.

Mutation UI có pending state, chặn double submit và công bố lỗi qua `aria-live`.
UI không optimistic-update tiền hoặc trạng thái đơn.

## Concurrency, audit và dữ liệu nhạy cảm

- Status update, refund và manual match đều khóa/đọc lại DB trong transaction.
- Payment tay lưu `recordedByUserId`; SePay tự động không có actor.
- Reference/note có giới hạn độ dài và chuỗi trắng normalize thành `null`.
- Business error dùng thông báo tiếng Việt ổn định.
- Log không chứa email, số điện thoại, địa chỉ hoặc raw bank payload.
