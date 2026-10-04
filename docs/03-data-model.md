# 03 — Mô hình dữ liệu

Định nghĩa bằng Prisma. Dưới đây là các entity và quan hệ chính.

## Sơ đồ quan hệ (rút gọn)

```
Category 1──* Product 1──* Variant
                  │
                  1──* ProductImageSet 1──* ProductImage
Order 1──* OrderItem *──1 Variant (tham chiếu + snapshot)
Order 1──* Payment
Order 1──* BankTransaction
ShippingZone 1──* ProvinceZone (tỉnh → zone)
AdminUser (Better Auth: user/session/account)
User 1──* CatalogApiToken 1──* CatalogApiAsset
                        1──* CatalogApiRequest
                        1──* CatalogApiAudit
```

## Prisma schema (rút gọn)

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
  imageSets   ProductImageSet[]
  variants    Variant[]
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}

enum ProductStatus { DRAFT ACTIVE ARCHIVED }

model ProductImageSet {
  id        String         @id @default(cuid())
  productId String
  product   Product        @relation(fields: [productId], references: [id], onDelete: Cascade)
  color     String
  position  Int            @default(0)
  isDefault Boolean        @default(false)
  images    ProductImage[]
  @@unique([productId, color])
}

model ProductImage {
  id         String          @id @default(cuid())
  imageSetId String
  imageSet   ProductImageSet @relation(fields: [imageSetId], references: [id], onDelete: Cascade)
  url        String
  position   Int             @default(0)
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
- **Danh mục trong admin là danh sách phẳng:** danh mục được tạo từ admin luôn
  có `parentId=null`; giao diện không cho đặt quan hệ cha/con. Slug được sinh
  duy nhất khi tạo và giữ ổn định khi đổi tên để URL lọc storefront không đổi.
  Danh mục chỉ được xoá khi không còn sản phẩm tham chiếu; trang admin liệt kê
  và liên kết toàn bộ sản phẩm đang thuộc từng danh mục.
- **Ảnh nhóm theo màu:** mỗi `ProductImageSet.color` phải khớp một màu đang có
  trong `Variant` của cùng sản phẩm. Mỗi sản phẩm có tối đa một bộ cho mỗi màu.
- Sản phẩm có bộ ảnh phải có đúng một bộ `isDefault=true`; unique index có điều
  kiện ở PostgreSQL chặn nhiều bộ mặc định. Mỗi bộ đã lưu có ít nhất một ảnh.
  Thứ tự bộ và ảnh được xác định bằng `position`, sau đó `id` để phá hoà.
- Ảnh đại diện và gallery ưu tiên bộ mặc định; dữ liệu cũ hoặc không đầy đủ
  thiếu bộ mặc định dùng bộ có thứ tự đầu tiên.
- **Phí ship theo vùng**: `ProvinceZone` ánh xạ 63 tỉnh → zone; nếu tỉnh chưa map thì dùng zone mặc định.

## Quản lý tồn kho (demo)

- Kiểm tra `stock >= quantity` tại bước checkout.
- **Trừ tồn kho khi đơn chuyển sang `PAID`** (trong cùng transaction với webhook/xác nhận tay).
- Job cron `expire-unpaid` huỷ đơn `PENDING_PAYMENT` quá hạn (VD 24h) — vì chưa trừ kho lúc tạo đơn nên không cần hoàn kho. (Nếu sau này muốn "giữ chỗ" tồn kho lúc tạo đơn thì bổ sung reservation + hoàn kho khi hết hạn.)
- Ghi nhận `Payment(direction=OUT)` không đổi `Order.status` và **không tự
  hoàn tồn kho**. Việc hoàn hàng/nhập kho lại nằm ngoài phạm vi demo.

## Catalog API

| Entity | Dữ liệu và invariant |
|---|---|
| `CatalogApiToken` (`catalog_api_token`) | Owner, tên, SHA-256 token unique, scopes, expiry/revocation, thời điểm dùng cuối và bộ đếm theo phút. Không lưu bearer secret. |
| `CatalogApiAsset` (`catalog_api_asset`) | Token sở hữu, URL WebP unique, số byte đã mã hóa, expiry và `attachedAt`. Token có asset được bảo vệ bằng FK `Restrict`. |
| `CatalogApiRequest` (`catalog_api_request`) | Unique `(tokenId, operation, key)`, hash payload và JSON response thành công. Không tự hết hạn; replay không ghi thêm resource/audit. |
| `CatalogApiAudit` (`catalog_api_audit`) | Token, operation, resource ID và timestamp cho mỗi mutation thành công lần đầu. Là nguồn đếm quota tạo sản phẩm. |

User phải còn role `owner` và chưa bị ban khi sử dụng token; hết hạn/thu hồi
không xóa sản phẩm, asset hoặc lịch sử. Scopes là `catalog:read`,
`products:create`, `images:write`. Token mới có hạn tối đa 90 ngày. User xóa
cascade token; token cascade request/audit nhưng asset FK chặn xóa token còn
asset. Vận hành dùng thu hồi thay vì xóa token.

Rate limit lưu trong DB là 60 request/phút/token, quota tạo sản phẩm là 10.000
lần thành công/token trong toàn bộ vòng đời. Quota ảnh là 250 MiB/token, tính
trên tổng byte asset record còn tồn tại, gồm cả ảnh đã gắn sản phẩm. Asset chưa
gắn hết hạn sau 24 giờ; cleanup xóa file và record, còn asset đã gắn được giữ
lại. `attachedAt` đánh dấu đã từng gắn, không phải phép đếm tham chiếu hiện tại;
API không tự thu hồi dung lượng khi admin bỏ ảnh hoặc xóa sản phẩm.

Product API chỉ tạo `DRAFT`, dùng chung thao tác transaction của catalog admin.
Asset phải thuộc đúng token và còn hạn hoặc đã gắn; server ánh xạ `assetId`
thành URL trong `ProductImage`. Các product/image record giữ URL, không tạo FK
trực tiếp tới asset. Slug do server sinh; SKU unique toàn catalog, cặp size/màu
unique trong sản phẩm và các invariant bộ ảnh vẫn áp dụng.

Mutation serialize bằng khóa dòng token. Kiểm tra quyền, quota, dữ liệu catalog,
đánh dấu asset đã gắn, response idempotency và audit commit cùng transaction.
Hash product tính sau khi normalize/default payload; hash ảnh gồm MIME và byte
gốc. Cùng key với hash khác trả conflict. Response đã lưu là snapshot lúc tạo;
GET product trả trạng thái hiện tại. File upload không có transaction chung với
DB; cleanup dọn crash-orphan có tên `catalog-<uuid>.webp` sau 24 giờ khi không
có asset hoặc product image tham chiếu. File không có prefix này được giữ lại.

Xem [catalog API](09-catalog-api.md) cho field constraints và quy tắc retry.
