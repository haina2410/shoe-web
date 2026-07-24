# Ngày 4 — Storefront: duyệt sản phẩm

**Mục tiêu:** Khách (guest) **duyệt** danh mục, **lọc** (giá / size / màu), **search theo tên không phân biệt hoa-thường & dấu**, và xem **trang chi tiết** (ảnh, chọn size/màu, tồn kho, mô tả). Trang chủ chuyển sang *product-forward* (hero + lưới nổi bật).

Spec nguồn: [../06-plan-10-days.md](../06-plan-10-days.md) §Ngày 4, [../03-data-model.md](../03-data-model.md), [../05-design-direction.md](../05-design-direction.md).

Nối tiếp Ngày 3 (đã merge vào `main` @ `806938d`): dùng lại `formatVnd`, design tokens (`--evergreen/--sage/--paper/--line/--accent`), `SiteHeader` (đã link `/products`, `/cart`), core sản phẩm `src/server/products.ts`, schema Product/Variant/Category/ProductImage. Ngày 4 lần đầu mở **lớp đọc** (`src/server/queries/`) cho storefront.

---

## Quyết định đã chốt (từ người dùng)

1. **Search không dấu = cột `Product.nameNormalized`.** Thêm cột đã bỏ dấu + lowercase, tính lúc create/update + trong seed; query `contains` chạy trong Postgres → integration-test bằng DB thật. (Không dùng extension `unaccent`, không lọc trong bộ nhớ.)
2. **Lọc giá = khoảng định sẵn.** Các mốc bấm chọn (nhiều mốc = OR). Định nghĩa một nguồn `PRICE_RANGES` dùng chung cho cả query lẫn UI.
3. **Trang chủ = hero + lưới nổi bật.** Giữ hero, thêm lưới vài sản phẩm ACTIVE nổi bật; polish kỹ để Ngày 9.

---

## Global Constraints (bắt buộc — reviewer soi theo đây)

- **Tiền = số nguyên VND** (`Int`); mọi hiển thị tiền đi qua `formatVnd`. Không parse tiền thành float.
- **Font đủ dấu tiếng Việt**; mọi chuỗi UI bằng tiếng Việt có dấu.
- **TypeScript strict**; không `any` lộ ra API công khai của query/component.
- **Storefront chỉ hiển thị sản phẩm `status = ACTIVE`.** DRAFT/ARCHIVED không bao giờ xuất hiện ở list, detail, home, search, facets. Detail của sản phẩm không-ACTIVE → `notFound()`.
- **Trạng thái lọc/search nằm trong URL `searchParams`** (chia sẻ được, back/forward hoạt động). Trang là Server Component; **`params` và `searchParams` là `Promise` (Next 16) — phải `await`**. Xử lý được cả `string` và `string[]` (chọn nhiều size/màu).
- **Lớp query thuần** (`src/server/queries/catalog.ts`): nhận `db: PrismaClient` + tham số đã parse; **không** import `next/*`, không auth (storefront công khai đọc). Integration-test bằng `testPrisma` trên `leafshoes_test`.
- **Chuẩn hoá search dùng chung một hàm** `normalizeText` cho cả lúc ghi (`nameNormalized`) lẫn lúc truy vấn (chuẩn hoá `q`) — nếu lệch nhau thì search sai. Đây là bất biến, test phải khoá.
- **Không mutation giỏ hàng ở Ngày 4.** Chọn biến thể chỉ hiển thị tồn kho + trạng thái; nút "Thêm vào giỏ" để Ngày 5 (có thể render nhưng disabled/placeholder, không gọi action).
- **Ảnh sản phẩm phải có fallback**: seed trỏ `/products/*.jpg` (file có thể chưa tồn tại) → card/detail phải render nền + motif "lá" (hoặc placeholder) khi thiếu ảnh, không vỡ layout.
- Trước khi viết code Next (image, params, metadata, Link): **đọc guide trong `node_modules/next/dist/docs/`** (AGENTS.md) — đây KHÔNG phải Next bạn quen.

---

## Task 1 — `normalizeText` + cột `Product.nameNormalized` + write-path + seed

**Mục tiêu:** Có nền tảng search không dấu, đồng bộ ở mọi đường ghi.

**Files:**
- `src/lib/normalize.ts` (mới) — `normalizeText(input: string): string`.
- `src/lib/normalize.test.ts` (mới) — unit.
- `prisma/schema.prisma` — thêm `nameNormalized String @default("")` vào `Product` (không unique; **không** thêm btree index — `LIKE %x%` không dùng được, để pg_trgm cho Ngày 9 nếu cần; ghi chú trong plan).
- migration mới (`npx prisma migrate dev --name product_name_normalized`) + `npx prisma generate`.
- `src/server/products.ts` — `createProductCore` + `updateProductCore` set `nameNormalized: normalizeText(input.product.name)`.
- `prisma/seed.ts` — upsert Product (cả nhánh `create` lẫn `update`) set `nameNormalized: normalizeText(p.name)`.

**`normalizeText` (khác `slugify`: GIỮ khoảng trắng để `contains` khớp cụm nhiều từ):**
```
đ/Đ → d/D  →  NFD + xoá \p{Diacritic}  →  toLowerCase  →  trim  →  gộp \s+ thành 1 space
```

**TDD:**
1. RED `normalize.test.ts`: `"Giày Chạy Bộ Êm"` → `"giay chay bo em"`; `"ĐÔ THỊ"` → `"do thi"`; giữ 1 space giữa từ, bỏ space thừa đầu/cuối/giữa; chuỗi rỗng → `""`. → GREEN viết `normalizeText`.
2. Sửa schema + `migrate dev` + `generate`. Cột `@default("")` cho hàng cũ (sẽ reseed đè).
3. Cập nhật `createProductCore`/`updateProductCore` + `seed.ts`.
4. Chạy lại `src/server/products.integration.test.ts` — phải vẫn xanh (thêm cột không được phá; nếu test assert deep-equal shape sản phẩm thì cập nhật kỳ vọng). Có thể thêm 1 assertion: sau `createProductCore`, `nameNormalized` đúng.

**Gate:** `migrate` up-to-date, `generate` xong, product integration tests xanh, `seed` chạy idempotent.

---

## Task 2 — Lớp query catalog thuần + `PRICE_RANGES` (integration-tested)

**Mục tiêu:** Toàn bộ logic lọc/search/sort/detail ở một nơi thuần, test bằng DB thật.

**Files:**
- `src/lib/catalog-filters.ts` (mới) — `PRICE_RANGES` (nguồn dùng chung UI+query) + kiểu `CatalogQuery`.
- `src/server/queries/catalog.ts` (mới):
  - `listProducts(db, query: CatalogQuery)` → sản phẩm ACTIVE + ảnh đầu (theo `position`) + `basePrice` + tổng tồn (sum stock variants) đã áp lọc + sort.
  - `getProductBySlug(db, slug)` → sản phẩm ACTIVE kèm images (sort position), variants (đủ), category; `null` nếu không có / không ACTIVE.
  - `listCategories(db)` → danh mục (cho nav + filter).
  - `getFacets(db)` → distinct size & color **chỉ từ variant của sản phẩm ACTIVE** (đổ vào filter UI).
- `src/server/queries/catalog.integration.test.ts` (mới).

**`PRICE_RANGES` (mốc, min inclusive / max exclusive; max `null` = không trần):**
| key | label | min | max |
|---|---|---|---|
| `duoi-500k` | Dưới 500k | 0 | 500000 |
| `500k-1tr` | 500k – 1 triệu | 500000 | 1000000 |
| `1tr-1r5` | 1 – 1,5 triệu | 1000000 | 1500000 |
| `tren-1r5` | Trên 1,5 triệu | 1500000 | null |

**Ngữ nghĩa lọc (chốt, reviewer soi):**
- **category**: theo `categorySlug` (1 giá trị).
- **size / color**: trong-facet **OR**, giữa-facet **AND**. Sản phẩm hiện nếu có ≥1 variant thuộc *một trong* các size chọn **và** có ≥1 variant thuộc *một trong* các màu chọn. (Không yêu cầu cùng 1 variant khớp cả hai — đủ cho demo; ghi chú.)
- **price**: `basePrice` rơi vào *một trong* các khoảng chọn (OR).
- **q (search)**: `nameNormalized contains normalizeText(q)` (rỗng/space → bỏ qua).
- Mọi nhóm lọc kết hợp bằng **AND** với nhau.
- **sort**: `moi-nhat` (createdAt desc, mặc định) | `gia-tang` (basePrice asc) | `gia-giam` (basePrice desc).

**TDD (integration, `testPrisma` + `resetDb()`):** seed fixture nhỏ trong test (vài sản phẩm ACTIVE + 1 DRAFT + variants size/màu đa dạng, giá rải các bucket).
1. `listProducts` không lọc → chỉ ACTIVE, đúng số, DRAFT bị loại.
2. lọc category / size / color (kiểm OR trong-facet, AND giữa-facet) / price bucket (1 và nhiều bucket).
3. **search không dấu:** `q="chay bo"`, `"CHẠY BỘ"`, `"Chạy"` đều khớp "Giày Chạy Bộ …"; `q` không khớp → rỗng.
4. sort 3 kiểu đúng thứ tự.
5. `getProductBySlug`: ACTIVE trả đủ variants+images-đã-sort; DRAFT/slug lạ → `null`.
6. `getFacets`: chỉ size/màu từ ACTIVE (variant của DRAFT không lọt).

**Gate:** file test này xanh.

---

## Task 3 — Product card + trang `/products` (lưới + bộ lọc)

**Files:**
- `src/components/product-card.tsx` (mới) — ảnh (fallback motif lá khi thiếu), tên, giá `formatVnd`, `<Link href="/products/[slug]">`. Server-safe (không cần "use client").
- `src/components/product-card.test.tsx` (mới) — RTL: render tên, giá đã format, href đúng; thiếu ảnh → fallback.
- `src/components/filters.tsx` (mới, `"use client"`) — category (radio/link), size (checkbox), màu (checkbox), khoảng giá (checkbox từ `PRICE_RANGES`), ô search, sort (select). Cập nhật `searchParams` qua `useRouter`/`usePathname`/`useSearchParams` (push, giữ các param khác). Search: submit-on-enter hoặc debounce.
- `src/components/filters.test.tsx` (mới) — RTL: render options từ facets/PRICE_RANGES; đổi 1 filter → gọi `router.push` với query đúng (mock `next/navigation`).
- `src/app/products/page.tsx` (mới) — Server Component: `await searchParams` → parse thành `CatalogQuery` (xử lý `string | string[] | undefined`) → `listProducts` + `listCategories` + `getFacets` → render `<Filters>` + lưới `<ProductCard>`; **empty state** "Không tìm thấy sản phẩm phù hợp." khi rỗng.

**TDD:** RED component tests trước (card, filters) → GREEN. Trang `/products` verify bằng build + E2E ở Task 5 (RSC + DB, không unit).

**Gate:** component tests xanh; `tsc`/`build` không lỗi type ở page.

---

## Task 4 — Trang chi tiết `/products/[slug]`

**Files:**
- `src/app/products/[slug]/page.tsx` (mới) — Server Component: `await params` → `getProductBySlug` → `notFound()` nếu `null`. Render gallery ảnh (fallback), tên, giá, mô tả, `<VariantSelector>`. Có thể thêm `generateMetadata` nhẹ (title = tên SP) — tuỳ, không bắt buộc.
- `src/components/variant-selector.tsx` (mới, `"use client"`) — chọn size + màu → resolve ra variant → hiển thị tồn kho ("Còn N sản phẩm" / "Hết hàng"), disable tổ hợp không tồn tại. Nút "Thêm vào giỏ" **để Ngày 5**: render nhưng disabled + ghi chú (không gọi action).
- `src/components/variant-selector.test.tsx` (mới) — RTL: chọn size+màu hợp lệ → hiện đúng stock; tổ hợp hết hàng → "Hết hàng" + nút disabled; tổ hợp không tồn tại → disabled/ẩn.

**TDD:** RED `variant-selector.test.tsx` → GREEN. Trang detail verify qua build + E2E.

**Phụ thuộc:** Task 2 (`getProductBySlug`). Độc lập với Task 3.

**Gate:** selector test xanh; build không lỗi type.

---

## Task 5 — Trang chủ product-forward + E2E storefront (headline)

**Files:**
- `src/app/page.tsx` (sửa) — giữ hero, thêm lưới ≤ 6 sản phẩm ACTIVE nổi bật (dùng `listProducts` sort mặc định) qua `<ProductCard>`; link "Xem tất cả" → `/products`.
- `e2e/storefront.spec.ts` (mới) — **headline**: mở trang chủ → thấy sản phẩm nổi bật → sang `/products` → **search không dấu** (gõ `"chay bo"` → thấy "Giày Chạy Bộ …") hoặc lọc theo danh mục → mở 1 sản phẩm → trang chi tiết hiện size/màu + tồn kho. (E2E chạy trên DB dev `leafshoes_development` đã seed — dựa vào dữ liệu seed hiện có.)

**TDD:** viết E2E mô tả luồng; chạy `npx playwright test storefront`.

**Gate cuối ngày (bắt buộc xanh mới đóng Ngày 4):**
- `npm run test` (Vitest) — toàn bộ xanh.
- `npm run build` — xanh.
- `npx playwright test` — storefront + các spec cũ (home/admin) xanh.
- `prisma migrate` up-to-date; `seed` idempotent.

---

## Thứ tự & phụ thuộc

`T1 → T2 → T3 → T4 → T5` (tuần tự, mỗi task 1 implementer subagent). T3 và T4 đều phụ thuộc T2 nhưng độc lập nhau — vẫn chạy tuần tự theo SDD (không parallel implementer). T5 phụ thuộc T3 (ProductCard) + T2.

## Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Search tiếng Việt sai dấu | Một hàm `normalizeText` dùng chung ghi+đọc; test khoá bất biến (T1, T2). |
| `nameNormalized` lệch giữa core và seed | T1 cập nhật **cả** core lẫn seed; ghi chú rõ seed không đi qua core. |
| Ảnh seed `/products/*.jpg` chưa tồn tại → vỡ layout | Fallback motif lá ở card + detail (Global Constraint). |
| `searchParams` là Promise + đa giá trị (Next 16) | Await + parser xử lý `string \| string[] \| undefined` (T3). |
| `LIKE %x%` không dùng index | Chấp nhận cho demo (data nhỏ); pg_trgm để Ngày 9 nếu cần — ghi chú, không làm giờ. |
| Thêm cột phá integration test cũ | T1 chạy lại `products.integration.test.ts`, cập nhật kỳ vọng nếu deep-equal. |

## Nợ mang sang (không chặn Ngày 4)

- Add-to-cart thật + store giỏ (Ngày 5).
- `next/image` tối ưu + config remotePatterns cho `/api/uploads/*` (giờ ưu tiên fallback đơn giản; polish Ngày 9).
- Phân trang `/products` (data nhỏ, chưa cần).
- pg_trgm index cho search nếu data lớn (Ngày 9+).
