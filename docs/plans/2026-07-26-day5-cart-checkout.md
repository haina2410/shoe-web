# Ngày 5 — Giỏ hàng + Checkout + Phí ship + VietQR

**Nhánh:** `feat/day5-cart-checkout` (off `main` @ `e8bff0b`)
**Ngày:** 2026-07-26
**Mục tiêu (doc 06 §Ngày 5):** khách (guest) duyệt → thêm vào giỏ → checkout (địa chỉ 2 cấp + email) → tính phí ship → tạo `Order`+`OrderItem` trong 1 transaction → thấy trang **VietQR** để chuyển khoản.

Tham chiếu nghiệp vụ: `docs/04-payment-checkout-flow.md`.

---

## Quyết định đã chốt (từ người dùng)

1. **VietQR = URL `img.vietqr.io`** (hàm thuần build URL, KHÔNG thêm dependency QR). Format đã xác minh:
   `https://img.vietqr.io/image/<BANK>-<ACCOUNT_NO>-<TEMPLATE>.png?amount=<AMOUNT>&addInfo=<orderCode>&accountName=<NAME>`
   — `addInfo` = **`orderCode`** (nội dung CK để đối soát). `template` mặc định `compact2`.
2. **Địa chỉ 2 cấp** (cải cách hành chính 2025 — bỏ cấp Quận/Huyện): **Tỉnh/Thành phố** (`<select>` 34 đơn vị) + **Phường/Xã** (text) + **địa chỉ cụ thể** (text). → **bỏ cột `district`** khỏi `Order` (migration drop column; chưa có đơn nào → an toàn).
3. **Config ngân hàng qua env** + placeholder ở `.env.example`; giá trị thật chỉ ở `.env` local (gitignored); dev/E2E dùng giá trị giả để app chạy được.
4. **Phí ship phẳng toàn quốc = 30.000₫**: **một** `ShippingZone` duy nhất (30k, `isDefault: true`); **cả 34 tỉnh/thành** seed vào `ProvinceZone` trỏ về zone đó. (Thay dữ liệu 2-zone 25k/35k của Ngày 2.)

## 34 tỉnh/thành (sau sáp nhập 2025 — 6 TP trực thuộc TW + 28 tỉnh)

Nguồn duy nhất: `src/lib/provinces.ts` (`export const PROVINCES`). **Đúng chính tả để khớp lookup.** 3 tên seed cũ (`TP. Hồ Chí Minh`, `Đồng Nai`, `Tây Ninh`) vẫn tồn tại sau sáp nhập.

```
TP trực thuộc TW (6): Hà Nội, Hải Phòng, Huế, Đà Nẵng, TP. Hồ Chí Minh, Cần Thơ
Tỉnh (28): Lai Châu, Điện Biên, Sơn La, Lào Cai, Tuyên Quang, Thái Nguyên,
  Phú Thọ, Bắc Ninh, Hưng Yên, Ninh Bình, Quảng Ninh, Cao Bằng, Lạng Sơn,
  Thanh Hóa, Nghệ An, Hà Tĩnh, Quảng Trị, Quảng Ngãi, Gia Lai, Đắk Lắk,
  Khánh Hòa, Lâm Đồng, Đồng Nai, Tây Ninh, Vĩnh Long, Đồng Tháp, An Giang, Cà Mau
```

---

## Ràng buộc toàn cục (Global Constraints — reviewer dùng làm lăng kính)

- **Tiền = số nguyên VND (`Int`)** ở mọi nơi (subtotal/shippingFee/total/unitPrice). Không float.
- **Guest checkout — KHÔNG auth**, NHƯNG action là POST không tin cậy: `safeParse` input + **đọc lại giá & tồn kho từ DB** (client chỉ gửi `variantId` + `quantity` + địa chỉ; KHÔNG BAO GIỜ tin `unitPrice`/tên do client gửi).
- **Ranh giới scope Ngày 5 (theo doc 04):** chỉ **KIỂM TRA** tồn kho (`stock >= quantity`) + tạo `Order` `PENDING_PAYMENT`. **KHÔNG trừ kho**, **KHÔNG enqueue job/email**, **KHÔNG webhook** — đó là Ngày 6.
- **`orderCode`** là nội dung đối soát = `addInfo` của VietQR. Sinh duy nhất (`LEAFXXXXXX`), unique DB (retry khi trùng trong transaction).
- **Bí mật:** `VIETQR_*` thật chỉ ở `.env` (gitignored); `.env.example` chỉ placeholder. KHÔNG log PII khách (email/phone/địa chỉ).
- **Giá trị dropdown tỉnh = đúng chuỗi `ProvinceZone.province`** (cùng nguồn `PROVINCES`) để `getShippingFee` khớp.
- **UI tiếng Việt có dấu.**
- **Next.js 16:** `params`/`searchParams` là Promise → `await`; trang `/orders/[orderCode]` `force-dynamic`; `notFound()` khi không thấy đơn. (Đọc `node_modules/next/dist/docs/` khi cần.)
- **Zustand persist phải chống hydration mismatch** (skipHydration + hydrate sau mount, hoặc chỉ render giỏ sau khi mounted).
- **Kiến trúc:** giữ pattern **core thuần / action mỏng**. `src/server/orders.ts` nhận `db`+input đã validate, KHÔNG import next/auth → integration-test được. Action mỏng bọc ngoài.
- **Tạo `Order`+`OrderItem` trong 1 `db.$transaction`** (như `createProductCore`).

---

## Thứ tự task

T1 (libs thuần) → T2 (seed 34 tỉnh + zone 30k + shipping + drop district) → T3 (order core + action) → T4 (giỏ hàng store + UI + nối variant-selector) → T5 (checkout + trang QR + env + E2E).

Base cho T1 = commit tạo plan này.

---

### Task 1 — Thư viện thuần + unit test (không DB, không React)

**File tạo:**
- `src/lib/provinces.ts` — `export const PROVINCES = [...34...] as const;` (đúng danh sách trên, đúng chính tả). Optional `isKnownProvince(p): boolean`.
- `src/lib/order-code.ts` — `generateOrderCode(): string` → `LEAF` + 6 ký tự `[A-Z0-9]` (dùng `crypto`, tránh ký tự dễ nhầm nếu muốn nhưng không bắt buộc). Thuần (không DB).
- `src/lib/vietqr.ts` —
  - `buildVietQrImageUrl(p: { bankCode; accountNo; accountName; amount: number; addInfo: string; template?: string }): string` — thuần, `encodeURIComponent` cho `addInfo`/`accountName`, `template` mặc định `"compact2"`, `amount` là số nguyên.
  - `vietQrConfigFromEnv(): { bankCode; accountNo; accountName; template? }` — đọc `VIETQR_BANK_CODE`/`VIETQR_ACCOUNT_NO`/`VIETQR_ACCOUNT_NAME`/`VIETQR_TEMPLATE?` (server-only usage). Thiếu env bắt buộc → throw thông báo rõ.
- `src/lib/cart-math.ts` — `cartSubtotal(items: { unitPrice: number; quantity: number }[]): number`; `orderTotal(subtotal: number, shippingFee: number): number`.
- `src/lib/validation/checkout.ts` —
  - `checkoutItemSchema = z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1) })`.
  - `createOrderInputSchema = z.object({ customerName: trim.min(1), email: trim.email(), phone: trim.min(1), province: z.enum(PROVINCES), ward: trim.min(1), addressLine: trim.min(1), note: trim.optional(), items: array(checkoutItemSchema).min(1) })`.
  - export types.

**Test (vitest unit):** `provinces.test.ts` (đúng 34 phần tử, không trùng, chứa 3 tỉnh mapped); `order-code.test.ts` (khớp `^LEAF[A-Z0-9]{6}$`, nhiều lần gọi khác nhau); `vietqr.test.ts` (cấu trúc URL, encode dấu cách/tiếng Việt, `amount` đúng, `addInfo`=orderCode, template mặc định + override); `cart-math.test.ts`; `validation/checkout.test.ts` (province ngoài danh sách bị loại, email sai loại, items rỗng loại, quantity<1 loại).

**Model:** rẻ nhất (chủ yếu transcription).

---

### Task 2 — Seed 34 tỉnh + zone 30k + shipping resolver + bỏ `district`

**Sửa dữ liệu/seed:**
- `prisma/data/provinces.ts`:
  - `import { PROVINCES } from "../../src/lib/provinces";`
  - `SHIPPING_ZONES = [{ name: "Giao hàng toàn quốc", fee: 30000, isDefault: true }] as const;`
  - `PROVINCE_ZONES = PROVINCES.map((province) => ({ province, zone: "Giao hàng toàn quốc" as ZoneName }));` (34 dòng)
  - Cập nhật comment (bỏ nội dung 3-tỉnh/2-zone cũ).
- `prisma/seed.test.ts`: cập nhật kỳ vọng — `provinceZone.count()` = `PROVINCE_ZONES.length` (34, đã đọc từ mảng nên tự đúng); `shippingZone.count()` = 1; `shippingZone.count({ where: { isDefault: true } })` = 1. Đảm bảo idempotent (chạy 2 lần count không đổi).

**Schema + migration:**
- `prisma/schema.prisma`: xoá field `district String` khỏi model `Order`.
- `npx prisma migrate dev --name order_drop_district` → migration `ALTER TABLE "order" DROP COLUMN "district";`.

**Shipping resolver:**
- `src/lib/shipping.ts` — `getShippingFee(db, province: string): Promise<number>`: tra `provinceZone.findUnique({ where:{ province }, include:{ zone:true } })` → `zone.fee`; nếu không thấy → zone `isDefault` (`shippingZone.findFirst({ where:{ isDefault:true } })`) → `fee`; nếu vẫn không có → throw. (Kết quả thực tế luôn 30k, nhưng giữ data-driven.)
- Integration test (`src/lib/shipping.integration.test.ts`, dùng `testPrisma`+`resetDb`, tự tạo fixture zone+province): tỉnh mapped → 30k; tỉnh không có trong bảng → default 30k; không có zone nào → throw.

**Model:** standard.

**Lưu ý reviewer:** đây là thay đổi dữ liệu seed của Ngày 2 (không phải schema zone). `isDefault` giữ vai trò fallback an toàn.

---

### Task 3 — Order core (transaction) + checkout action

**File tạo:**
- `src/server/orders.ts` — `createOrderCore(db, input: CreateOrderInput): Promise<Order>` chạy trong `db.$transaction(async (tx) => {...})`:
  1. Với mỗi item: `tx.variant.findUnique({ where:{id}, include:{ product:true } })`; không thấy → throw; `variant.stock < quantity` → throw (thông báo VN nêu tên/size/màu).
  2. `unitPrice = variant.priceOverride ?? variant.product.basePrice`; snapshot `productName=product.name`, `size`, `color`.
  3. `subtotal = cartSubtotal(...)`; `shippingFee = await getShippingFee(tx, input.province)`; `total = orderTotal(subtotal, shippingFee)`.
  4. `orderCode`: sinh `generateOrderCode()`, kiểm `tx.order.findUnique({where:{orderCode}})`, retry (≤5) tới khi chưa tồn tại; hết lượt → throw.
  5. `tx.order.create({ data:{ orderCode, ...address, subtotal, shippingFee, total, status:PENDING_PAYMENT, items:{ create:[...OrderItem snapshot...] } } })`.
  6. **KHÔNG** giảm `variant.stock`. **KHÔNG** enqueue.
  7. return order.
- `src/server/actions/checkout.ts` — `"use server"`, `createOrderAction(input): Promise<{ ok:true; orderCode:string } | { ok:false; error:string }>`:
  - `createOrderInputSchema.safeParse(input)` → lỗi trả `{ok:false,error}`.
  - `await createOrderCore(prisma, parsed.data)` (bọc try/catch → `{ok:false,error}` cho lỗi tồn kho).
  - trả `{ ok:true, orderCode }`. **KHÔNG** redirect (client tự điều hướng để clear giỏ). **KHÔNG** requireAdmin (guest).

**Test:** `src/server/orders.integration.test.ts` (`testPrisma`, fixture product+variants+zone): happy path (subtotal/shipping 30k/total đúng, `OrderItem` snapshot đúng, status PENDING_PAYMENT); tồn kho thiếu → throw + **0 order** tạo ra (rollback); variant lạ → throw; 2 đơn liên tiếp có `orderCode` khác nhau & unique; **assert stock KHÔNG đổi** sau khi tạo đơn. Test action: input rỗng/không hợp lệ → `{ok:false}` không gọi core (hoặc trả lỗi).

**Model:** standard.

---

### Task 4 — Giỏ hàng: store + nối variant-selector + trang /cart

**File tạo/sửa:**
- `src/lib/cart.ts` — Zustand store `useCart` với `persist` (localStorage key `"leafshoes-cart"`), **chống hydration** (skipHydration + `useCartHydrated`/rehydrate sau mount, hoặc cờ mounted).
  - `CartItem = { variantId; productId; slug; name; size; color; unitPrice; imageUrl: string | null; quantity }`.
  - actions: `addItem(item)` (gộp theo `variantId`, cộng dồn quantity), `setQuantity(variantId, q)` (q≤0 → xoá), `removeItem(variantId)`, `clear()`.
  - selector/helper: danh sách items + subtotal (dùng `cartSubtotal`).
  - Cài `zustand` (`npm i zustand`).
- `src/components/variant-selector.tsx` — **nối nút "Thêm vào giỏ"**:
  - Thêm props product context: `productId`, `slug`, `name`, `imageUrl: string | null` (ngoài `variants`, `basePrice` hiện có).
  - Nút enable khi `matchedVariant && matchedVariant.stock > 0`; click → `addItem({...})` với `unitPrice=effectivePrice`. Bỏ chú thích/subtext "Giỏ hàng sẽ có ở bước sau". Có phản hồi (link "Xem giỏ hàng" / trạng thái đã thêm).
- `src/app/products/[slug]/page.tsx` — truyền props mới cho `<VariantSelector>` (productId, slug, name, imageUrl ảnh đầu).
- `src/app/cart/page.tsx` — client, đọc `useCart`: bảng/list item (ảnh fallback 🌿 nếu null, tên, size/màu, đơn giá, sửa số lượng +/− hoặc input, nút xoá), **subtotal**, nút "Thanh toán" → `/checkout`, empty state ("Giỏ hàng trống" + link /products). Chỉ render sau hydrate.

**Test (RTL, mock localStorage/next-navigation khi cần):** store (`cart.test.ts`: add gộp, setQuantity, removeItem, clear, subtotal); variant-selector (thêm đúng item khi còn hàng; nút disable khi hết hàng/chưa chọn đủ); cart page (render item, đổi số lượng gọi setQuantity, empty state).

**Model:** standard.

---

### Task 5 — Trang checkout + trang QR + env + E2E

**File tạo/sửa:**
- `.env.example` — thêm:
  ```
  # VietQR — tài khoản ngân hàng NHẬN tiền (điền giá trị THẬT ở .env, không commit).
  VIETQR_BANK_CODE="MB"           # mã ngân hàng NAPAS / tên viết tắt
  VIETQR_ACCOUNT_NO="0000000000"
  VIETQR_ACCOUNT_NAME="LEAFSHOES VIETNAM"
  # VIETQR_TEMPLATE="compact2"
  ```
  và **thêm giá trị giả tương ứng vào `.env` local** (để dev/E2E render được trang QR).
- `src/app/checkout/page.tsx` — client, đọc `useCart`; form: `customerName`, `email`, `phone`, `province` (`<select>` từ `PROVINCES`), `ward`, `addressLine`, `note?`; hiển thị **subtotal** (phí ship + tổng hiện ở trang xác nhận, server-authoritative); submit → `createOrderAction({ ...address, items: cart.items.map(→{variantId,quantity}) })`:
  - `{ok:true}` → `clear()` giỏ + `router.push('/orders/'+orderCode)`.
  - `{ok:false}` → hiển thị lỗi (VN). Giỏ rỗng → chặn submit / chuyển /products.
- `src/app/orders/[orderCode]/page.tsx` — **Server Component**, `export const dynamic = "force-dynamic"`, `await params`; `prisma.order.findUnique({ where:{orderCode}, include:{items:true} })` → null thì `notFound()`; build URL bằng `buildVietQrImageUrl({ ...vietQrConfigFromEnv(), amount: order.total, addInfo: order.orderCode })`; render: ảnh QR (`<img src>`), số TK / chủ TK / ngân hàng, **số tiền** (`formatVnd(order.total)`), **nội dung CK = `order.orderCode`** (nhấn mạnh "ghi đúng nội dung"), tóm tắt đơn (items + subtotal + phí ship + tổng), trạng thái "Chờ thanh toán".
- `e2e/checkout.spec.ts` — headline (guest, không login): home → `/products` → mở 1 sản phẩm → chọn size+màu → **Thêm vào giỏ** → `/cart` (thấy item + subtotal) → **Thanh toán** → điền form (chọn tỉnh, ward, địa chỉ, tên, email, phone) → **Đặt hàng** → `/orders/<code>`: thấy ảnh `img.vietqr.io`, thấy `orderCode`, thấy `formatVnd(total)`.

**Test:** E2E trên. (Component test checkout-form tùy chọn: render đủ 34 option tỉnh + submit gọi action — nếu nhanh thì thêm.)

**Model:** standard.

---

## Cổng cuối ngày (controller tự chạy, không chỉ tin report)

- `npx prisma migrate status` up-to-date (+ migration `order_drop_district`).
- `npx prisma db seed` clean + idempotent (34 provinceZone, 1 zone 30k).
- Vitest toàn bộ xanh (unit + integration).
- `npm run build` OK (routes `/cart`, `/checkout`, `/orders/[orderCode]`).
- Playwright: bộ cũ + `checkout.spec.ts` xanh.
- `tsc`/lint sạch. Không secret commit, không log PII.

## Ghi nhận nợ kỹ thuật / defer (điền khi chạy)

- Không trừ kho ở Ngày 5 → race oversell 2 đơn cùng lấy hàng cuối: xử lý khi trừ kho lúc PAID (Ngày 6).
- Trang `/orders/[orderCode]` là URL năng-lực (ai có code đều xem được) — chấp nhận cho demo guest; xem lại nếu cần bảo mật.
- (kế thừa) test isolation `fileParallelism:false`; money `Int`→`BigInt`; Day-9 polish bucket.
