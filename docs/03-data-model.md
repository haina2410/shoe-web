# 03 — Mô hình dữ liệu

Định nghĩa bằng Prisma. Dưới đây là các entity và quan hệ chính.

## Sơ đồ quan hệ (rút gọn)

```
Category 1──* Product 1──* Variant
                  │
                  1──* ProductImage
Order 1──* OrderItem *──1 Variant (tham chiếu + snapshot)
Order 1──* Payment
Order 1──* BankTransaction
ShippingZone 1──* ProvinceZone (tỉnh → zone)
AdminUser (Better Auth: user/session/account)
```

## Prisma schema (nháp)

```prisma
model Category {
  id       String    @id @default(cuid())
  name     String
  slug     String    @unique
  parentId String?
  parent   Category? @relation("CategoryTree", fields: [parentId], references: [id])
  children Category[] @relation("CategoryTree")
  products Product[]
}

model Product {
  id          String         @id @default(cuid())
  name        String
  slug        String         @unique
  description String?
  categoryId  String
  category    Category       @relation(fields: [categoryId], references: [id])
  basePrice   Int            // VND, lưu số nguyên (đồng)
  status      ProductStatus  @default(DRAFT)
  images      ProductImage[]
  variants    Variant[]
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}

enum ProductStatus { DRAFT ACTIVE ARCHIVED }

model ProductImage {
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  url       String
  position  Int     @default(0)
}

model Variant {
  id            String  @id @default(cuid())
  productId     String
  product       Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  size          String  // VD "40", "41"
  color         String  // VD "Đen", "Trắng"
  sku           String  @unique
  priceOverride Int?    // nếu khác basePrice
  stock         Int     @default(0)   // TỒN KHO THEO BIẾN THỂ
  @@unique([productId, size, color])
}

model Order {
  id           String      @id @default(cuid())
  orderCode    String      @unique      // VD "LEAF8F3K2P" — dùng làm nội dung CK
  email        String
  customerName String
  phone        String
  province     String
  district     String
  ward         String
  addressLine  String
  note         String?
  subtotal     Int
  shippingFee  Int
  total        Int
  status       OrderStatus @default(PENDING_PAYMENT)
  paidAt       DateTime?
  lastRefundAt DateTime?
  items        OrderItem[]
  payments     Payment[]
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  @@index([email])
  @@index([status])
}

enum OrderStatus { PENDING_PAYMENT PAID FULFILLED COMPLETED CANCELLED EXPIRED }
enum PaymentDirection { IN OUT }

model OrderItem {
  id          String  @id @default(cuid())
  orderId     String
  order       Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  variantId   String
  variant     Variant @relation(fields: [variantId], references: [id])
  // snapshot tại thời điểm mua (giá/tên có thể đổi sau này):
  productName String
  size        String
  color       String
  unitPrice   Int
  quantity    Int
}

model Payment {
  id                String           @id @default(cuid())
  orderId           String
  order             Order            @relation(fields: [orderId], references: [id])
  provider          String           // "sepay" | "manual"
  transactionId     String           @unique
  amount            Int
  direction         PaymentDirection @default(IN)
  externalReference String?
  note              String?
  recordedByUserId  String?
  recordedBy        User?            @relation("RecordedPayments", fields: [recordedByUserId], references: [id], onDelete: SetNull)
  rawPayload        Json?
  matchedAt         DateTime         @default(now())
}

model ShippingZone {
  id        String         @id @default(cuid())
  name      String         // VD "Nội thành HCM", "Miền Bắc"
  fee       Int
  provinces ProvinceZone[]
}

model ProvinceZone {
  id       String       @id @default(cuid())
  province String       @unique
  zoneId   String
  zone     ShippingZone @relation(fields: [zoneId], references: [id])
}
```

> **Better Auth** tự sinh bảng `user`, `session`, `account`, `verification` qua adapter Prisma. Trường `role` (OWNER/STAFF) gắn vào user theo plugin admin/access-control.

## Ghi chú thiết kế dữ liệu

- **Tiền lưu số nguyên VND** (đồng) để tránh sai số dấu phẩy động.
- **Snapshot trong OrderItem**: đơn hàng giữ tên/giá tại thời điểm mua, không phụ thuộc thay đổi sản phẩm sau này.
- **`Payment.transactionId` unique** là chốt chặn idempotency cho webhook.
- **Sổ tiền `IN/OUT`:** `IN` là tiền đã nhận, `OUT` là khoản hoàn đã ghi
  nhận. Migration đặt mặc định `IN` để toàn bộ payment cũ giữ nguyên ý nghĩa.
  Tổng hợp được suy ra, không lưu thêm cột trạng thái:
  - chưa hoàn: `totalOut = 0`;
  - hoàn một phần: `0 < totalOut < totalIn`;
  - hoàn toàn bộ: `totalOut = totalIn`.
- **`Order.lastRefundAt`** là timestamp nullable của lần hoàn tiền thành công
  gần nhất, phục vụ lọc/sắp xếp vận hành; đây không phải nguồn tính số tiền đã
  hoàn. Mỗi khoản `OUT` lưu người ghi nhận cùng mã tham chiếu/ghi chú tùy chọn.
- Tổng `OUT` cộng dồn không được vượt tổng `IN`; thao tác hoàn tiền khóa đơn
  trong transaction để hai yêu cầu đồng thời cũng không vượt số thực nhận.
- **Tồn kho ở cấp `Variant`** (theo size+màu) đúng yêu cầu.
- **Phí ship theo vùng**: `ProvinceZone` ánh xạ 63 tỉnh → zone; nếu tỉnh chưa map thì dùng zone mặc định.

## Quản lý tồn kho (demo)

- Kiểm tra `stock >= quantity` tại bước checkout.
- **Trừ tồn kho khi đơn chuyển sang `PAID`** (trong cùng transaction với webhook/xác nhận tay).
- Job cron `expire-unpaid` huỷ đơn `PENDING_PAYMENT` quá hạn (VD 24h) — vì chưa trừ kho lúc tạo đơn nên không cần hoàn kho. (Nếu sau này muốn "giữ chỗ" tồn kho lúc tạo đơn thì bổ sung reservation + hoàn kho khi hết hạn.)
- Ghi nhận `Payment(direction=OUT)` không đổi `Order.status` và **không tự
  hoàn tồn kho**. Việc hoàn hàng/nhập kho lại nằm ngoài phạm vi demo.
