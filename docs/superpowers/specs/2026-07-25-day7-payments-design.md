# Ngày 7 — SePay, đối soát thanh toán và hết hạn đơn

## Mục tiêu

Ngày 7 bổ sung đường thanh toán hoàn chỉnh cho MVP:

- nhận webhook SePay đã xác thực;
- lưu bền vững mọi giao dịch chuyển khoản vào, kể cả chưa khớp;
- tự động khớp đúng đơn và đúng số tiền;
- chuyển đơn sang `PAID`, trừ tồn kho đúng một lần và enqueue email trong cùng transaction;
- cho `OWNER` xác nhận thanh toán thủ công;
- hết hạn đơn chưa thanh toán sau 24 giờ;
- hiển thị trạng thái thanh toán thật trên trang đơn công khai.

Phạm vi này nối tiếp Ngày 5–6. Checkout vẫn chỉ kiểm tra kho và tạo
`PENDING_PAYMENT`; worker/email hiện có tiếp tục chạy ở process riêng.

## Quyết định provider contract đã được phê duyệt

Toàn bộ hệ thống dùng mã thanh toán liền nhau `LEAFXXXXXX`, khớp chính xác
`^LEAF[A-Z0-9]{6}$`. Generator, database, URL, VietQR, email, admin, webhook,
test và dữ liệu demo đều dùng cùng định dạng này.

Trong SePay phải cấu hình payment code với prefix `LEAF` và suffix đúng 6 ký
tự chữ hoa hoặc chữ số. Migration hardening Ngày 7 chuyển các mã lịch sử sang
dạng liền nhau mà không đổi `Order.id`, nên uniqueness và mọi relation được
giữ nguyên.

## Các phương án đã cân nhắc

### A. `BankTransaction` riêng, `Payment` chỉ chứa thanh toán đã khớp — chọn

Mọi event SePay được lưu theo ID nhà cung cấp. Giao dịch có trạng thái xử lý,
lý do cần review và liên kết đơn optional. Chỉ khi một đơn thật sự được xác
nhận `PAID` mới tạo `Payment`.

Ưu điểm:

- không mất dấu giao dịch sai nội dung, sai tiền, đơn hết hạn hoặc hết kho;
- idempotency áp dụng được cả event khớp và không khớp;
- tách rõ “tiền ngân hàng đã đến” khỏi “đơn đã được ghi nhận thanh toán”;
- chuẩn bị dữ liệu sạch cho màn hình giao dịch chưa khớp ở Ngày 8.

Đổi lại, cần thêm một model và migration.

### B. Cho `Payment.orderId` và `matchedAt` nullable

Ít model hơn nhưng một bảng phải đồng thời đại diện event thô, giao dịch cần
review và payment đã khớp. Các invariant trở nên khó đọc, nhiều field nullable,
và logic manual payment bị trộn với webhook.

### C. Chỉ lưu webhook đã khớp, còn lại ghi log

Ít code nhất nhưng không phù hợp hệ thống tiền thật: log có thể hết retention,
không hỗ trợ xử lý tay và không đảm bảo idempotency cho event chưa khớp.

## Mô hình dữ liệu

Thêm enum:

```prisma
enum BankTransactionStatus {
  RECEIVED
  MATCHED
  REVIEW_REQUIRED
}
```

Thêm model:

```prisma
model BankTransaction {
  id                    String                @id @default(cuid())
  provider              String
  providerTransactionId String                @unique
  gateway               String
  accountNumber         String
  transferType          String
  amount                Int
  paymentCode           String?
  content               String
  referenceCode         String?
  occurredAt            DateTime
  rawPayload            Json
  status                BankTransactionStatus @default(RECEIVED)
  reviewReason          String?
  orderId               String?
  order                 Order?                @relation(fields: [orderId], references: [id])
  processedAt           DateTime?
  createdAt             DateTime              @default(now())
  updatedAt             DateTime              @updatedAt

  @@index([status, createdAt])
  @@index([orderId])
  @@map("bank_transaction")
}
```

`Order` có thêm relation `bankTransactions`. `Payment` giữ nguyên vai trò bản
ghi thanh toán đã khớp. Với SePay, `Payment.transactionId` bằng chuỗi của
`payload.id`; với thao tác tay, ID ổn định là `manual:<orderId>`.

`rawPayload` là dữ liệu nhạy cảm: không log, không đưa vào job hoặc client.
Màn hình xem payload đầy đủ không thuộc Ngày 7.

## Hợp đồng webhook

Route: `POST /api/webhooks/sepay`, Node.js runtime.

Route đọc `request.text()` đúng một lần. Trước khi parse JSON, route xác thực:

- `X-SePay-Timestamp` là Unix seconds hợp lệ và lệch không quá 300 giây;
- `X-SePay-Signature` có dạng `sha256=<hex>`;
- chữ ký là HMAC-SHA256 của `<timestamp>.<raw_body>` dùng
  `SEPAY_WEBHOOK_SECRET`;
- so sánh chữ ký bằng constant-time comparison.

Payload được validate bằng Zod với các trường chính thức của SePay. Chỉ nhận:

- `transferType === "in"`;
- `transferAmount` là số nguyên VND dương;
- `accountNumber` trùng `VIETQR_ACCOUNT_NO`;
- `id` là ID event hợp lệ.
- `description` và `referenceCode` là chuỗi, kể cả chuỗi rỗng;
- `transactionDate` đúng `YYYY-MM-DD HH:mm:ss`, là ngày lịch hợp lệ, rồi được
  ánh xạ từ giờ Việt Nam `+07:00`.

Mã đơn được lấy từ `payload.code`, normalize uppercase/trim và phải khớp chính
xác `^LEAF[A-Z0-9]{6}$`. Không tự động đoán từ nội dung tự do trong Ngày 7;
`code` thiếu hoặc không hợp lệ được lưu `REVIEW_REQUIRED`.

Phản hồi thành công, kể cả duplicate hay chưa khớp:

```json
{"success":true}
```

với HTTP 200. Sai chữ ký trả 401; payload sai trả 400. Lỗi DB/queue tạm thời
trả 500 để SePay retry. Response không chứa PII hoặc chi tiết reconciliation.

## Luồng lưu event và đối soát

Xử lý có hai ranh giới transaction:

1. Persist event:
   - insert `BankTransaction(status=RECEIVED)` bằng
     `providerTransactionId = String(payload.id)`;
   - lưu `paymentCode` đã normalize/validate và giữ nguyên object JSON ban đầu
     trong `rawPayload`, kể cả field provider bổ sung mà Zod chưa biết;
   - nếu unique conflict, load bản ghi hiện có;
   - duplicate `MATCHED` hoặc `REVIEW_REQUIRED` trả thành công mà không khởi
     tạo queue;
   - duplicate còn `RECEIVED` tiếp tục reconciliation, nhờ đó crash sau insert
     không làm event bị kẹt mãi.
2. Sau khi event đã bền vững, làm nóng queue; nếu bước này lỗi, trả 500 nhưng
   giữ đúng một event `RECEIVED`.
3. Reconcile event `RECEIVED` chỉ từ các cột đã lưu, không đọc lại request:
   - tìm `Order` theo `paymentCode`;
   - yêu cầu `order.total === event.amount`;
   - yêu cầu đơn đang `PENDING_PAYMENT`;
   - claim bank event bằng conditional update trên `id`,
     `providerTransactionId` và `status = RECEIVED`;
   - chuyển đơn bằng conditional update
     `where id = ? and status = PENDING_PAYMENT`;
   - gộp quantity theo `variantId`, sort `variantId` tăng dần rồi decrement
     bằng conditional update `where id = ? and stock >= quantity`;
   - tạo `Payment(provider="sepay")`;
   - cập nhật `BankTransaction` thành `MATCHED`;
   - enqueue `send-payment-confirmed` qua `fromPrisma(tx)`;
   - commit toàn bộ hoặc rollback toàn bộ.

Nếu không tìm thấy đơn, lệch tiền, đơn không còn pending hoặc thiếu kho, event
được chuyển `REVIEW_REQUIRED` với reason machine-readable; đơn, kho, `Payment`
và email job không thay đổi.

Các mismatch biết được trước khi mutate được đánh dấu review trực tiếp. Nếu
conditional stock/order mutation thất bại giữa transaction, toàn bộ transaction
reconciliation rollback trước; sau đó một transaction ngắn riêng chỉ chuyển
event còn `RECEIVED` sang `REVIEW_REQUIRED`. Không giữ lại decrement dở dang.

Nếu queue warm-up hoặc enqueue lỗi, event đã persist vẫn `RECEIVED`; riêng
enqueue nằm trong payment transaction nên order/payment/stock/job cùng
rollback. Webhook trả 500 để lần retry tiếp tục xử lý từ chính event đã lưu.
Một request retry thay đổi code/amount không thể thay đổi nguồn sự thật. Nếu
hai event khác nhau cùng nhắm vào một đơn, chỉ conditional transition đầu tiên
được quyền trừ kho. Nếu hai đơn cạnh tranh số kho cuối cùng, conditional stock
decrement bảo đảm tồn kho không âm; transaction thua được đưa sang review.

## Xác nhận thanh toán thủ công

Ngày 7 có một màn hình tối thiểu `/admin/orders/pending`, chỉ liệt kê đơn
`PENDING_PAYMENT` và nút “Xác nhận đã thanh toán”. Danh sách/filter/detail đầy
đủ và màn hình giao dịch chưa khớp vẫn thuộc Ngày 8.

Server Action:

- gọi `requireAdmin()`;
- chỉ cho role `owner`; `staff` bị từ chối dù hiện có `order:update`;
- chỉ nhận `orderId`, không nhận amount/status từ client;
- gọi cùng primitive `markOrderPaid` mà webhook dùng;
- tạo `Payment(provider="manual", transactionId="manual:<orderId>")`;
- dùng conditional order transition, atomic stock decrement và transactional
  enqueue giống webhook;
- click lặp là no-op an toàn, không trừ kho/gửi email lần hai.

Nếu thiếu kho, action trả thông báo nghiệp vụ an toàn và không thay đổi đơn.

## Job, email và cron

Thêm queue `send-payment-confirmed` với cùng retry/backoff email hiện có.
Payload chỉ chứa `{ orderCode }`.

Worker load đơn từ DB, render React Email và gửi qua Mailer hiện có. Email xác
nhận thanh toán dùng Resend idempotency key ổn định
`payment-confirmed:<orderCode>`; email xác nhận đặt hàng giữ hành vi hiện có.
Template xác nhận đã nhận tiền, mã đơn, tổng tiền và thông báo cửa hàng sẽ xử
lý đơn; không đưa dữ liệu thừa vào log hoặc idempotency key.

Thêm queue `expire-unpaid`. Worker đăng ký schedule ổn định:

- cron `*/15 * * * *`;
- timezone `UTC`;
- cutoff mặc định `now - 24 hours`;
- cập nhật theo batch các đơn `PENDING_PAYMENT` cũ thành `EXPIRED`;
- chạy lặp an toàn;
- không hoàn kho vì checkout chưa giữ/trừ kho.

Payment và expiry cùng condition trên `PENDING_PAYMENT`; transaction thắng
trước quyết định trạng thái. Event tiền đến sau khi expiry thắng được lưu
`REVIEW_REQUIRED`, không bị bỏ mất.

## Trang đơn công khai

`/orders/[orderCode]` tiếp tục `force-dynamic` và hiển thị trạng thái từ DB:

- `PENDING_PAYMENT`: hiện QR và hướng dẫn chuyển khoản;
- `PAID`, `FULFILLED`, `COMPLETED`: ẩn QR, hiện xác nhận đã nhận thanh toán;
- `EXPIRED` hoặc `CANCELLED`: ẩn QR, thông báo đơn không còn nhận thanh toán.

E2E có thể refresh trang này để quan sát kết quả webhook mà không cần chạy
email worker trong Playwright.

## Lỗi và observability

- Không log raw webhook, email, số điện thoại, địa chỉ hoặc số tài khoản.
- Log lỗi xác nhận tay chỉ gồm operation/category ổn định; không log
  `error.message`, `String(error)`, payload hoặc PII.
- Business mismatch trả HTTP 200 sau khi đã lưu `REVIEW_REQUIRED`.
- Authentication/validation failure không ghi DB.
- Infrastructure failure không được giả thành success.
- Không có Grafana riêng trong MVP; dùng structured application logs hiện có.

## Biến môi trường

Thêm vào `.env.example`:

```dotenv
SEPAY_WEBHOOK_SECRET=
```

`VIETQR_ACCOUNT_NO` tiếp tục là nguồn sự thật cho tài khoản nhận tiền.
Production bắt buộc HTTPS; IP allowlist là lớp bổ sung ở reverse proxy/firewall,
không hardcode trong application vì danh sách có thể thay đổi.

Ngoài biến môi trường của app, cấu hình payment code phía SePay bắt buộc dùng
prefix `LEAF` và suffix 6 ký tự alphanumeric.

## Chiến lược test

Mọi production change theo RED → GREEN → REFACTOR.

### Unit

- HMAC đúng/sai, timestamp hết hạn và raw-body exactness;
- schema payload và mapping field SePay;
- mã đơn hợp lệ/thiếu/sai;
- route 401/400/200/500 mà không rò dữ liệu;
- template và handler email;
- expiry cutoff với `now` được inject;
- OWNER được xác nhận tay, STAFF/anonymous bị chặn.

### Integration PostgreSQL + pg-boss

- webhook khớp tạo một event, một payment, `PAID`, `paidAt`, decrement đúng
  nhiều item và một email job;
- sai mã/sai tiền được lưu review, không đổi đơn/kho/job;
- duplicate tuần tự và đồng thời chỉ xử lý một lần;
- hai đơn cạnh tranh stock `1` cho kết quả đúng một đơn paid, stock bằng `0`;
- enqueue lỗi rollback payment/order/stock nhưng giữ event `RECEIVED`;
- manual click lặp không trừ/gửi lần hai;
- expiry bỏ qua đơn mới, `PAID` và chạy lặp an toàn;
- race payment–expiry không tạo trạng thái hoặc stock sai.

### E2E

Tạo đơn guest, ký và POST payload webhook test, refresh trang đơn, quan sát
trạng thái đã thanh toán và QR bị ẩn. Tính đúng kho được bảo vệ ở integration
test thay vì phụ thuộc worker trong Playwright.

## Carry-over liên quan

Khi variant đã được `OrderItem` tham chiếu, việc admin xóa variant trong lúc
update sản phẩm có thể gặp FK `RESTRICT`. Ngày 7 bổ sung regression test và
chuyển lỗi Prisma này thành business error an toàn vì orders bắt đầu được dùng
thực tế.

## Ngoài phạm vi

- danh sách/detail/filter đơn hoàn chỉnh;
- UI xử lý giao dịch chưa khớp;
- refund hoặc hoàn tiền tự động;
- đồng bộ lịch sử giao dịch từ SePay API khi webhook bị mất;
- Zalo/Telegram notification;
- COD, giữ chỗ tồn kho và hoàn kho;
- dashboard observability riêng.

Các mục quản trị đầu tiên thuộc Ngày 8; reconciliation định kỳ là hardening
sau MVP nếu vận hành thực tế yêu cầu.
