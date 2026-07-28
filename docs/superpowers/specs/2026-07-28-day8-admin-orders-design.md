# Ngày 8 — Quản lý đơn hàng, đối soát tay và hoàn tiền

## 1. Mục tiêu

Ngày 8 hoàn thiện lát cắt vận hành cho cửa hàng nhỏ:

- staff và owner xem, lọc và mở chi tiết đơn;
- staff và owner cùng được xác nhận thanh toán, huỷ đơn, chuyển trạng thái giao
  hàng và xử lý giao dịch SePay chưa khớp;
- nhân viên ghi nhận một hoặc nhiều lần hoàn tiền đã tự chuyển khoản cho khách;
- mọi mutation tiền và trạng thái chống ghi đè/race, có kiểm tra quyền và dữ liệu
  từ DB.

Đây vẫn là MVP. Không xây workflow engine, tích hợp hãng vận chuyển, tự động
chuyển khoản hoàn tiền hoặc quy trình kế toán doanh nghiệp.

## 2. Quyết định nghiệp vụ

### 2.1. Vòng đời đơn

Các chuyển trạng thái hợp lệ:

```text
PENDING_PAYMENT ──(nhận tiền)──► PAID ──► FULFILLED ──► COMPLETED
       │
       ├──(nhân viên huỷ)──────► CANCELLED
       └──(cron quá hạn)───────► EXPIRED
```

- `FULFILLED` hiển thị là **Đang giao**: cửa hàng đã đóng gói và bàn giao cho
  đơn vị vận chuyển.
- `COMPLETED` hiển thị là **Hoàn tất**: khách đã nhận hàng hoặc cửa hàng đã
  kết thúc đơn.
- `CANCELLED`, `EXPIRED` và `COMPLETED` là terminal.
- `PENDING_PAYMENT → PAID` chỉ đi qua payment core; action đổi trạng thái thông
  thường không được giả lập thanh toán.
- `PAID → FULFILLED` bị chặn nếu tổng tiền đã hoàn bằng tổng tiền đã nhận.
- Không có trạng thái `REFUNDED`. Trạng thái đơn mô tả vòng đời xử lý; hoàn
  tiền là ledger tài chính độc lập.

### 2.2. Phân quyền

`owner` và `staff` đều có quyền `order:update`, vì cửa hàng nhỏ cần người vận
hành thực hiện trọn luồng:

- xác nhận thanh toán thủ công;
- ghép giao dịch SePay chưa khớp;
- huỷ đơn còn `PENDING_PAYMENT`;
- chuyển `PAID → FULFILLED → COMPLETED`;
- ghi nhận hoàn tiền `OUT`.

Mỗi Server Action vẫn phải gọi `requireAdmin()`, validate input và tự đọc dữ
liệu tin cậy từ DB. Việc render/ẩn nút không phải security boundary.

### 2.3. Hoàn tiền

Payment là ledger bất biến theo hướng tiền:

```text
IN  = tiền cửa hàng nhận
OUT = tiền cửa hàng đã chuyển trả khách
```

Quy tắc:

- một đơn có thể có nhiều payment `OUT`;
- `amount` luôn là số nguyên VND dương; hướng tiền nằm ở `direction`;
- chỉ đơn `PAID`, `FULFILLED` hoặc `COMPLETED` mới được ghi `OUT`;
- tổng `OUT` sau mutation không được lớn hơn tổng `IN`;
- tạo `OUT` và cập nhật `Order.lastRefundAt` diễn ra trong cùng transaction;
- không tự đổi `Order.status`;
- không tự cộng tồn kho; nhân viên tự quản lý tồn khi thực sự nhận lại giày;
- không sửa hoặc xoá ledger payment trong Ngày 8.

Trạng thái hoàn tiền được dẫn xuất:

```text
NONE    khi totalOut = 0
PARTIAL khi 0 < totalOut < totalIn
FULL    khi totalOut = totalIn
```

UI dùng nhãn **Chưa hoàn**, **Đã hoàn một phần**, **Đã hoàn toàn bộ**. Một đơn
được xem là đã có hoàn tiền ngay khi có ít nhất một payment `OUT`.

## 3. Data model và migration

Thêm enum:

```prisma
enum PaymentDirection {
  IN
  OUT
}
```

Mở rộng model:

```prisma
model Order {
  // các field hiện có
  lastRefundAt DateTime?
}

model Payment {
  // các field hiện có
  direction        PaymentDirection @default(IN)
  externalReference String?
  note              String?
  recordedByUserId  String?
  recordedBy        User?            @relation(
    "RecordedPayments",
    fields: [recordedByUserId],
    references: [id],
    onDelete: SetNull
  )
}

model User {
  // các field hiện có
  recordedPayments Payment[] @relation("RecordedPayments")
}
```

- Default `IN` backfill toàn bộ payment Ngày 7 mà không thay đổi ý nghĩa.
- SePay tự động có `recordedByUserId = null`.
- Xác nhận tay, ghép tay và hoàn tiền lưu user thực hiện.
- `externalReference` là mã tham chiếu chuyển khoản tùy chọn.
- Payment `OUT` dùng `transactionId` nội bộ duy nhất dạng
  `manual-refund:<UUID>`; không phụ thuộc việc nhân viên có nhập mã ngân hàng.
- `matchedAt` tiếp tục là thời điểm ledger entry được ghi nhận.
- Không tạo bảng `Refund` riêng.

## 4. Kiến trúc nghiệp vụ

### 4.1. Máy trạng thái thuần

`src/lib/order-status.ts` chịu trách nhiệm duy nhất về:

- nhãn tiếng Việt cho mọi `OrderStatus`;
- bảng chuyển trạng thái hợp lệ;
- `canTransitionOrder(from, to)`;
- trạng thái đích khả dụng cho UI.

Kiểm tra số dư payment không nhét vào helper thuần. Core đổi trạng thái kiểm tra
thêm điều kiện `netReceived > 0` trước `PAID → FULFILLED`.

### 4.2. Core đổi trạng thái

`src/server/orders/update-status.ts`:

1. khoá row `Order` trong DB transaction;
2. đọc lại trạng thái hiện tại;
3. kiểm tra transition bằng máy trạng thái;
4. khi fulfill, aggregate `IN` và `OUT`, chặn nếu net bằng `0`;
5. update có điều kiện theo trạng thái đã đọc;
6. trả snapshot tối thiểu cho Server Action.

Server Action chỉ nhận `orderId` và `targetStatus`; không nhận trạng thái hiện
tại từ client. Sau mutation, revalidate danh sách, chi tiết admin và trang đơn
công khai.

### 4.3. Core ghi nhận hoàn tiền

`src/server/payments/record-refund.ts`:

1. validate amount nguyên dương;
2. mở transaction và khoá row `Order`;
3. xác nhận order thuộc `PAID | FULFILLED | COMPLETED`;
4. aggregate tổng `IN` và `OUT` từ DB;
5. chặn khi không có `IN` hoặc `totalOut + amount > totalIn`;
6. tạo payment `OUT` với transaction ID sinh ở server, actor, reference/note;
7. cập nhật `lastRefundAt` cùng timestamp;
8. trả tổng `IN`, `OUT` và trạng thái hoàn tiền mới.

Khoá row làm hai yêu cầu refund đồng thời tuần tự hoá, nên cả hai không thể
cùng đọc số dư cũ rồi hoàn vượt mức.

### 4.4. Ghép giao dịch chưa khớp

`src/server/payments/match-reviewed-transaction.ts` xử lý riêng event đã ở
`REVIEW_REQUIRED`; không đổi event về `RECEIVED` ngoài transaction.

Input từ client chỉ gồm `bankTransactionId` và `orderCode`. Trong một
transaction:

1. claim đúng event `REVIEW_REQUIRED`;
2. đọc order theo mã canonical `^LEAF[A-Z0-9]{6}$`;
3. yêu cầu order còn `PENDING_PAYMENT` và amount bằng chính xác `Order.total`;
4. gọi đường payment dùng chung để chuyển `PAID`, trừ kho, tạo payment `IN`,
   ghi actor, liên kết event và enqueue email;
5. chuyển event thành `MATCHED`.

Để không lồng transaction hoặc nhân đôi logic, payment core Ngày 7 được refactor
thành một transactional helper nội bộ nhận `expectedBankTransactionStatus`.
Webhook tự động truyền `RECEIVED` và không có actor; manual match truyền
`REVIEW_REQUIRED` cùng `recordedByUserId`. Cả hai vẫn dùng một đường atomically
claim event, claim order, trừ kho, tạo payment và enqueue.

Sai mã, lệch tiền, thiếu tồn hoặc race không làm mất event; nó vẫn
`REVIEW_REQUIRED` với reason hiện có để nhân viên thử lại sau khi kiểm tra.

## 5. Giao diện admin

### 5.1. Danh sách `/admin/orders`

- sắp xếp mới nhất trước;
- lọc theo một `OrderStatus`;
- lọc đơn có ít nhất một payment `OUT`;
- tìm chính xác/gần đúng theo `orderCode`;
- hiển thị mã đơn, khách, thời gian, tổng tiền, trạng thái đơn, trạng thái hoàn
  tiền và link chi tiết;
- giới hạn 100 bản ghi gần nhất cho mỗi bộ lọc, phù hợp quy mô MVP.

`searchParams` là Promise theo Next.js 16 và được await trước khi dựng Prisma
filter. Mọi query param đều được parse theo allow-list; giá trị lạ quay về
filter mặc định.

### 5.2. Chi tiết `/admin/orders/[id]`

Hiển thị:

- thông tin khách và địa chỉ;
- item snapshot, size, màu, số lượng và giá;
- subtotal, phí ship, total;
- lịch sử payment `IN/OUT`, actor, reference và note;
- bank transaction liên quan;
- trạng thái đơn và trạng thái hoàn tiền dẫn xuất.

Hành động:

- xác nhận đã thanh toán khi còn `PENDING_PAYMENT`;
- huỷ khi còn `PENDING_PAYMENT`;
- chuyển sang **Đang giao** hoặc **Hoàn tất** khi hợp lệ;
- form hoàn tiền gồm amount, reference tùy chọn và note tùy chọn.

Nút mutation là Client Component nhỏ, có pending state, vô hiệu hoá double
submit và thông báo lỗi qua vùng `aria-live`.

### 5.3. Giao dịch cần xử lý

`/admin/bank-transactions/review` liệt kê `REVIEW_REQUIRED` cũ nhất trước:

- thời gian, ngân hàng/tài khoản rút gọn, số tiền;
- nội dung chuyển khoản và mã parse được nếu có;
- reason tiếng Việt;
- form nhập mã đơn để ghép.

Không hiển thị raw JSON đầy đủ và không có thao tác xoá/ignore event trong MVP.

### 5.4. Điều hướng

- dashboard admin có link **Đơn hàng** và **Giao dịch cần xử lý**;
- `/admin/orders/pending` trở thành redirect tương thích tới
  `/admin/orders?status=PENDING_PAYMENT`;
- trang công khai `/orders/[orderCode]` tiếp tục dùng trạng thái từ DB; Ngày 8
  chỉ bổ sung copy cho `FULFILLED` và `COMPLETED` nếu cần.

## 6. Lỗi, concurrency và audit

- Business error trả message tiếng Việt ổn định; lỗi hạ tầng log không chứa PII.
- ID, enum, amount, reference và note đều validate bằng Zod ở Server Action.
- Reference/note có giới hạn độ dài; chuỗi trắng normalize thành `null`.
- Status update, refund và manual matching đều đọc lại DB trong transaction.
- UI không optimistic-update tiền hoặc trạng thái đơn.
- Payment ledger lưu actor cho mutation tay; event SePay tự động không có actor.
- Không log email, số điện thoại, địa chỉ hoặc raw bank payload.

## 7. Kiểm thử

### Unit

- toàn bộ ma trận transition hợp lệ/không hợp lệ;
- nhãn trạng thái;
- trạng thái refund dẫn xuất từ tổng `IN/OUT`;
- validation refund và filter query.

### Integration trên Postgres thật

- status transition hợp lệ và stale/race bị chặn;
- full refund chặn fulfill;
- nhiều `OUT` hợp lệ, vượt tổng `IN` bị rollback;
- hai refund đồng thời không thể hoàn vượt;
- refund không đổi status và không đổi stock;
- manual match `REVIEW_REQUIRED → MATCHED` tạo đúng một payment `IN`, trừ kho
  một lần và enqueue email atomically;
- failure giữ event ở `REVIEW_REQUIRED`.

### Authz và component

- staff và owner đều thực hiện được mọi action Ngày 8;
- non-admin bị chặn trước khi mutation;
- list/detail/review render đúng empty state, filter và action.

### E2E

1. đăng nhập staff;
2. mở đơn đã thanh toán;
3. chuyển `PAID → FULFILLED → COMPLETED`;
4. ghi một refund `OUT` và thấy badge/số dư cập nhật;
5. mở giao dịch chưa khớp, ghép với đơn pending và thấy order chuyển `PAID`.

Cổng cuối ngày: lint, toàn bộ Vitest, production build và Playwright Day 8.

## 8. Ngoài phạm vi

- tự động gọi API ngân hàng để hoàn tiền;
- partial capture, chargeback hoặc dispute;
- tự động cộng lại tồn kho;
- sửa/xoá payment ledger;
- huỷ đơn sau thanh toán;
- gửi email hoàn tiền/đang giao;
- tích hợp tracking GHN/GHTK;
- phân trang phức tạp, export CSV hoặc báo cáo kế toán.
