# Day 3 — Admin CRUD sản phẩm / biến thể / tồn kho + upload ảnh (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: dùng superpowers:subagent-driven-development để thực thi plan này task-by-task. Mỗi task = 1 commit. Các bước dùng checkbox (`- [ ]`).
>
> **⚠️ Đây KHÔNG phải Next.js bạn từng biết.** Repo dùng **Next.js 16** (breaking changes so với training data). Đọc guide trong `node_modules/next/dist/docs/` trước khi viết code. Điểm quan trọng cho ngày này:
> - **Server Action mặc định giới hạn body 1MB** → **upload ảnh KHÔNG đi qua Server Action**, mà qua **Route Handler** (`src/app/api/admin/upload/route.ts`). Xem `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`.
> - Server Action là **entry point không tin cậy**: "Render-time gating is not a security boundary". Mọi action mutating **phải tự authenticate + authorize + validate input**.
> - Mutating data / revalidate: xem `01-app/01-getting-started/mutating-data.md`, `09-revalidating.md`.

**Goal:** Admin quản lý danh mục sản phẩm end-to-end: danh sách sản phẩm (bảng server), form tạo/sửa sản phẩm với **nhiều biến thể inline** (size/màu/giá/tồn), xoá sản phẩm, **chỉnh nhanh tồn kho**, **upload ảnh thật ra ổ đĩa local**. Kèm **2 must-fix bảo mật mang từ Ngày 2**: tắt đăng ký công khai + mọi Server Action tự gác quyền. Tất cả có test thật (unit thuần + integration DB thật + E2E đăng nhập → tạo sản phẩm).

**Quyết định thiết kế đã chốt với người dùng (Ngày 3):**
1. **Danh sách sản phẩm = bảng server đơn giản** (Server Component render `<table>`, sort cơ bản qua query param). KHÔNG dùng TanStack Table.
2. **Upload ảnh = upload file thật ra local**, lưu vào `UPLOAD_DIR` (gitignored), phục vụ qua Route Handler; `ProductImage.url` trỏ tới đường dẫn phục vụ đó.
3. **Biến thể nhập inline trong form sản phẩm** (tạo/sửa sản phẩm + N biến thể trong 1 form, thêm/xoá dòng biến thể).

**Architecture:** Monolith Next.js 16 App Router (TS strict). Prisma 7 + Postgres local. Better Auth 1.6 (admin plugin). RBAC hai lớp đã có từ Ngày 2 (`proxy.ts` lạc quan + `requireAdmin()` thật + `can()` thuần). Ngày 3 thêm lớp **server actions** (`src/server/**`) và **UI admin** (`src/app/admin/products/**`, `src/components/admin/**`).

**Tách lớp để test được (nguyên tắc xuyên suốt Ngày 3):** logic ghi DB tách thành **hàm core thuần** `*Core(db, input)` trong `src/server/products.ts` — không import `next/*`, không auth → **integration-test trực tiếp với `testPrisma`**. Server Action (`src/server/actions/products.ts`) chỉ là lớp mỏng bọc ngoài: `requireAdmin()` → `can()` → parse `FormData` (zod) → gọi core → `revalidatePath` → `redirect`. Nhờ vậy `can()` trở thành **load-bearing** (có test khẳng định staff bị chặn) mà không cần dựng cả HTTP.

**Tech Stack (thêm mới ngày này):** `zod` (validate input server action — dependency mới). Còn lại dùng đồ đã có: shadcn (`button` sẵn; thêm `input`/`label` nếu smooth, không thì tự viết control tối giản bằng Tailwind + tokens), `lucide-react`, Vitest, Playwright, `tsx`.

## Global Constraints (bám sát — dùng làm lens cho reviewer)

- Package manager **npm**. **TypeScript strict, KHÔNG dùng `any`.**
- **Tiền = số nguyên VND** (`Int`); validate `basePrice ≥ 0`, `priceOverride ≥ 0`, `stock ≥ 0`, đều là **số nguyên**.
- **UI đủ dấu tiếng Việt.** Slug sinh từ tên: **bỏ dấu tiếng Việt**, lowercase, gạch nối, **đảm bảo unique** (đụng thì thêm `-2`, `-3`…).
- **[MUST-FIX #1] `disableSignUp: true`** trong `src/lib/auth.ts` — app chỉ có guest checkout, **không có tài khoản khách**. Owner/staff tạo qua **seed** (server-side, không qua endpoint public). Có test khẳng định sign-up bị từ chối.
- **[MUST-FIX #2 / GUARDRAIL] Mọi Server Action mutating VÀ Route Handler upload phải TỰ gọi `requireAdmin()` + `can(role, resource, action)` ở đầu.** Layout KHÔNG gác POST; `proxy.ts` matcher `/admin/:path*` KHÔNG phủ `/api/**`. Đây là chốt bảo mật thật của ngày này.
- **Không commit secret.** Credential seed (owner/staff) đọc từ env; `.env.example` chỉ chứa placeholder. `UPLOAD_DIR` và thư mục upload thật **gitignored**.
- **KHÔNG echo lại PII người dùng** (email/điện thoại/địa chỉ khách) trong log/return value (org rule). Ngày 3 chủ yếu là dữ liệu sản phẩm nên rủi ro thấp, nhưng giữ nguyên tắc.
- Prisma: **KHÔNG sửa 4 model auth**. Ngày 3 **không cần đổi schema** (Product/Variant/ProductImage/Category đã đủ từ Ngày 2) — nếu phát sinh nhu cầu đổi schema, dừng và báo.
- Client Prisma ở `src/generated/prisma` (gitignored) — sau đổi schema phải `npx prisma generate`.
- **Cổng test cuối ngày:** `npm run test` xanh (unit + integration), `npm run build` ok, `npx prisma migrate status` up-to-date, `npx prisma db seed` chạy sạch + idempotent, **E2E Ngày 3 pass** (đăng nhập owner → tạo sản phẩm + biến thể → thấy trong list) + E2E guard Ngày 2 vẫn xanh.

## Hiện trạng đầu Ngày 3 (đã có từ Ngày 1–2)

- **Models nghiệp vụ đầy đủ**: `Category, Product (status DRAFT/ACTIVE/ARCHIVED, basePrice Int, slug unique), ProductImage (url, position, cascade theo product), Variant (size,color,sku unique, priceOverride Int?, stock Int, @@unique[productId,size,color], cascade theo product), Order/OrderItem/Payment/ShippingZone/ProvinceZone`.
- `src/lib/permissions.ts`: statement `{ product:[create,read,update,delete], order:[read,update] }`; `owner` full, `staff` = `product:[read]`, `order:[read,update]`. Export `ac, owner, staff, roles`.
- `src/lib/rbac.ts`: `can(role, resource, action): boolean` (thuần, bọc `roles.authorize`), `isAdminRole(role)`, types `AppRole`/`Resource` (`"product"|"order"`).
- `src/lib/auth-guard.ts`: `requireAdmin()` — `auth.api.getSession({headers})`; không session → `redirect("/login")`; role không admin → `redirect("/")`; trả `session`.
- `src/lib/auth.ts`: `betterAuth` + `prismaAdapter` + `admin({ ac, roles:{owner,staff}, defaultRole:"staff", adminRoles:["owner"] })`. **`emailAndPassword:{enabled:true}` CHƯA có `disableSignUp`** → lỗ hổng cần vá.
- `src/proxy.ts`: redirect lạc quan non-auth khỏi `/admin` (matcher `/admin/:path*`).
- `src/app/admin/layout.tsx`: gọi `requireAdmin()` (bọc trang render). `src/app/admin/page.tsx`: stub "Bảng điều khiển".
- `src/app/login/page.tsx`: **stub** (chưa có form thật). Chưa có `authClient`.
- `prisma/seed.ts`: export `async function seed(prisma)` (idempotent upsert categories/products/variants/images/zones) + CLI entry tự dựng PrismaClient. `src/test/db.ts`: `testPrisma` + `resetDb()` (TRUNCATE 9 bảng nghiệp vụ, **không đụng bảng auth**). `vitest.globalSetup.ts`: migrate deploy lên `DATABASE_URL_TEST`.
- UI: `src/components/ui/button.tsx` (shadcn base-nova) là component UI duy nhất. `site-header`/`site-footer` có sẵn. Design tokens ở `src/app/globals.css` (biến `--evergreen` v.v.).
- Route auth: `src/app/api/auth/[...all]/route.ts` (Better Auth handler).

---

### Task 1: Vá bảo mật đăng ký + seed tài khoản admin + form đăng nhập thật

**Vì sao trước tiên:** đây là MUST-FIX #1 và là **enabler**: E2E Ngày 3 phải đăng nhập được bằng tài khoản thật mới tạo sản phẩm.

**Files:**
- Modify: `src/lib/auth.ts` — thêm `disableSignUp: true`.
- Create: `src/lib/auth-client.ts` — `createAuthClient` (`better-auth/react`) + `adminClient` plugin; export `authClient`, `signIn`, `signOut`, `useSession`.
- Modify: `prisma/seed.ts` — thêm hàm **riêng** `seedAdminUsers()` (KHÔNG nằm trong `seed(prisma)` testable), chạy trong CLI entry.
- Create: `src/app/login/page.tsx` (thay stub) — form đăng nhập client.
- Modify: `.env` + `.env.example` — thêm `SEED_OWNER_EMAIL/SEED_OWNER_PASSWORD/SEED_STAFF_EMAIL/SEED_STAFF_PASSWORD` (`.env.example` chỉ placeholder).
- Create test: `src/lib/auth.signup-disabled.test.ts` (hoặc integration) + E2E gộp ở Task 6.

**Chi tiết & lưu ý kỹ thuật (ĐÃ verify qua ctx7 + đọc package):**

- **`disableSignUp`**: đặt trong `emailAndPassword: { enabled: true, disableSignUp: true }`. Endpoint public `/api/auth/sign-up/email` sẽ bị từ chối.
- **Seed user KHÔNG đi qua `seed(prisma)` testable.** Lý do: `seed.test.ts` gọi `seed(testPrisma)` (DB test), nhưng `auth.api.createUser` dùng **global `auth` → global prisma (DATABASE_URL dev)** — nếu nhét vào `seed(prisma)` sẽ ghi user nhầm DB khi chạy test. → Tách `seedAdminUsers()` gọi trong **CLI entry** của seed.ts (chạy trên DB dev).
- **Tạo user server-side**: dùng `auth.api.createUser({ body: { email, password, name, role } })` **KHÔNG truyền `headers`**. Đã xác nhận từ source better-auth: handler `/admin/create-user` chỉ chặn khi có request context mà thiếu session; gọi server-side thuần (không headers) bỏ qua guard đó → tạo được user kèm `role`. Hàm này tự hash mật khẩu + tạo bản ghi `account` (provider credential) đúng chuẩn.
- **Idempotent**: trước khi tạo, kiểm tra `prisma.user.findUnique({ where:{ email } })`; nếu đã có thì bỏ qua (không throw). Seed owner (role `"owner"`) + staff (role `"staff"`).
- **`auth-client.ts`**: `createAuthClient({ plugins: [adminClient()] })` (baseURL mặc định same-origin). Trang login gọi `authClient.signIn.email({ email, password }, { onSuccess })` rồi điều hướng tới `?redirect=` (mặc định `/admin`).
- **Login form** (client component `"use client"`): 2 field email/password + nút "Đăng nhập"; đọc `redirect` từ `useSearchParams`; hiện lỗi tiếng Việt khi sai. **KHÔNG** tự lưu/log mật khẩu. Giữ tối giản, dùng tokens sẵn có.

**TDD:**
- [ ] **Test đỏ:** `src/lib/auth.signup-disabled.test.ts`: gọi `auth.api.signUpEmail({ body:{ email:"x@test.local", password:"…", name:"X" } })` → **expect reject/throw** (đăng ký bị tắt). (Không tạo bản ghi vì bị chặn trước khi chạm DB.)
- [ ] **Green:** thêm `disableSignUp: true`.
- [ ] Viết `auth-client.ts` + login form + `seedAdminUsers()` + env. `npx prisma db seed` tạo owner/staff; chạy lần 2 không lỗi (idempotent). (Bằng chứng E2E đăng nhập nằm ở Task 6.)
- [ ] `npm run build` ok. Commit `feat(auth): disable public signup, seed admin users, real login form`.

**Report cho reviewer:** kết quả test signup-disabled; output `db seed` 2 lần (idempotent); xác nhận `.env.example` chỉ có placeholder.

---

### Task 2: Helper thuần — slug (bỏ dấu tiếng Việt) + schema validate (zod)

**Files:**
- Create: `src/lib/slug.ts` — `slugify(input: string): string`, `uniqueSlug(base: string, exists: (slug:string)=>Promise<boolean>): Promise<string>`.
- Create: `src/lib/validation/product.ts` — zod schemas + inferred types.
- Add dep: `zod` (`npm i zod`). Kiểm tra version qua ctx7 nếu cần API mới.
- Create tests: `src/lib/slug.test.ts`, `src/lib/validation/product.test.ts`.

**`slugify` yêu cầu:**
- Bỏ dấu tiếng Việt: dùng `String.prototype.normalize("NFD")` + xoá dấu kết hợp (`/\p{Diacritic}/gu`), xử lý riêng `đ/Đ → d`.
- Lowercase, thay ký tự không phải `[a-z0-9]` bằng `-`, gộp nhiều `-`, trim `-` đầu/cuối.
- Ví dụ test: `"Giày Sục Nữ"` → `"giay-suc-nu"`; `"Dép Đi Trong Nhà"` → `"dep-di-trong-nha"`; `"  Áo   Khoác!! "` → `"ao-khoac"`; chuỗi rỗng/toàn ký tự lạ → fallback (vd `"san-pham"`).

**`uniqueSlug` yêu cầu:** gọi `exists(candidate)`; nếu free trả luôn; nếu trùng thử `base-2`, `base-3`… tới khi free. Test dùng `exists` giả (Set) — không đụng DB.

**zod schemas:**
- `variantInputSchema`: `size` (non-empty), `color` (non-empty), `sku` (non-empty, trim), `priceOverride` (`z.number().int().min(0)` **nullable/optional**), `stock` (`z.number().int().min(0)`).
- `productInputSchema`: `name` (non-empty), `description` (optional), `categoryId` (non-empty), `basePrice` (`z.number().int().min(0)`), `status` (`z.enum(["DRAFT","ACTIVE","ARCHIVED"])` default `"DRAFT"`).
- `createProductInputSchema`: `product: productInputSchema` + `variants: z.array(variantInputSchema).min(1)` (ít nhất 1 biến thể).
- `updateVariantStockSchema`: `variantId` non-empty, `stock` int ≥ 0.
- Export type inferred (`z.infer`).

**TDD:**
- [ ] **Test đỏ trước** cho `slugify`, `uniqueSlug`, và từng nhánh zod (reject basePrice âm / không nguyên; reject stock âm; reject sku rỗng; reject name rỗng; reject variants rỗng; accept payload hợp lệ; priceOverride null hợp lệ).
- [ ] **Green:** viết `slug.ts` + `validation/product.ts` cho xanh.
- [ ] Commit `feat(lib): add vietnamese slug + zod product/variant validation`.

---

### Task 3: Server actions sản phẩm (CRUD + chỉnh tồn nhanh) + core testable + authz

**Files:**
- Create: `src/server/products.ts` — **hàm core thuần** (nhận `db: PrismaClient`, input đã validate; KHÔNG import `next/*`, KHÔNG auth):
  - `createProductCore(db, input: CreateProductInput): Promise<Product>` — sinh slug unique (dùng `uniqueSlug` với `exists` = query `product.findUnique({where:{slug}})`); tạo product + variants trong `db.$transaction`.
  - `updateProductCore(db, id, input)` — cập nhật product; đồng bộ biến thể (chiến lược đơn giản: xoá biến thể không còn + upsert biến thể theo `sku`/id). Ghi rõ chiến lược trong code.
  - `deleteProductCore(db, id)` — `product.delete` (cascade images + variants). Nếu vướng OrderItem (RESTRICT) → ném lỗi rõ ràng (Ngày 3 chưa có order nên không xảy ra).
  - `updateVariantStockCore(db, variantId, stock)`.
- Create: `src/server/actions/products.ts` — **Server Actions** (`"use server"`), lớp mỏng:
  - Mỗi action: `const session = await requireAdmin();` → `if (!can(session.user.role, "product", "<create|update|delete>")) redirect("/");` → parse `FormData` qua zod (`createProductInputSchema` v.v.) → gọi `*Core(prisma, …)` → `revalidatePath("/admin/products")` → `redirect("/admin/products")` (hoặc trả `{error}` cho form).
  - Actions: `createProductAction`, `updateProductAction`, `deleteProductAction`, `updateVariantStockAction`.
  - **Nguyên tắc bảo mật (theo Next docs):** client chỉ gửi **id + thay đổi**; đọc lại phần còn lại từ nguồn tin cậy. Validate `FormData` là untrusted. `can()` phải được gọi thật (không chỉ `requireAdmin`).
- Create tests:
  - `src/server/products.integration.test.ts` (DB thật, `testPrisma`, `resetDb()` trong `beforeEach`; seed sẵn 1 category để gắn product).
  - `src/server/actions/products.authz.test.ts` (mock `@/lib/auth-guard` để `requireAdmin` trả session role `"staff"`; khẳng định action **không** ghi DB và bị chặn — `can("staff","product","create") === false`).

**Integration test (core) — các case:**
- [ ] `createProductCore` hợp lệ → product tồn tại, `slug` unique, đúng số biến thể, `stock` đúng, `basePrice` đúng.
- [ ] Tạo 2 sản phẩm **trùng tên** → slug thứ hai có hậu tố `-2`.
- [ ] SKU trùng (2 biến thể cùng sku, hoặc trùng sku đã có) → **ném lỗi** (không tạo im lặng). Kiểm tra không còn bản ghi rác (transaction rollback).
- [ ] `deleteProductCore` → product + images + variants bị xoá (đếm = 0).
- [ ] `updateVariantStockCore` → stock đổi đúng; (tuỳ chọn) chặn số âm đã do zod lo ở lớp action, core có thể assert lại.
- [ ] `updateProductCore` đổi tên/giá + thêm/bớt biến thể → phản ánh đúng.

**Authz test:**
- [ ] `createProductAction` khi role staff → bị chặn (redirect/không ghi). Owner → qua. (Mock `requireAdmin`; spy prisma hoặc đếm bản ghi.)

- [ ] Commit `feat(server): product CRUD core + guarded server actions`.

---

### Task 4: Upload ảnh qua Route Handler (local disk) + phục vụ file

**Vì sao Route Handler, không Server Action:** Server Action cap body 1MB (Next 16 docs). Upload đi qua `POST /api/admin/upload`.

**Files:**
- Create: `src/lib/upload.ts` — thuần I/O, testable với `UPLOAD_DIR` override:
  - `saveProductImage(file: File): Promise<{ url: string }>` — validate mime ∈ {image/jpeg,image/png,image/webp}, đuôi hợp lệ, size ≤ `MAX_UPLOAD_BYTES` (vd 5MB); sinh tên an toàn `products/<cuid>.<ext>`; ghi vào `UPLOAD_DIR` (env, mặc định `path.join(process.cwd(),"uploads")`); trả `url = "/api/uploads/products/<cuid>.<ext>"`.
  - Ném lỗi rõ ràng cho loại/size không hợp lệ.
- Create: `src/app/api/admin/upload/route.ts` — `POST`: `requireAdmin()` → `if(!can(role,"product","update")) 403` → đọc `formData()` lấy `file` → `saveProductImage` → `Response.json({url})`. (staff `product:[read]` → **bị 403**, đúng ý đồ.)
- Create: `src/app/api/uploads/[...path]/route.ts` — `GET`: phục vụ file từ `UPLOAD_DIR`. **Chống path traversal** (chuẩn hoá + đảm bảo nằm trong `UPLOAD_DIR`); 404 nếu thiếu; set `Content-Type` theo đuôi.
- Modify: `.gitignore` (+`/uploads`), `.env`/`.env.example` (`UPLOAD_DIR`, `MAX_UPLOAD_BYTES` optional).
- Create tests: `src/lib/upload.test.ts` (đặt `process.env.UPLOAD_DIR` = thư mục scratch tạm; ghi + đọc lại; reject .txt/exe; reject quá size; tên trả về đúng pattern), `src/app/api/uploads/serve.test.ts` (gọi hàm GET route trực tiếp: traversal `../` → 403/404; file hợp lệ → 200 + content-type; thiếu → 404).

**TDD:**
- [ ] **Đỏ:** test `saveProductImage` (chấp nhận png hợp lệ → file tồn tại + url đúng; reject text/quá-size) và test serve route (traversal chặn; content-type).
- [ ] **Green:** viết `upload.ts` + 2 route handler.
- [ ] Authz route: (tuỳ chọn, gọn) test POST upload với `requireAdmin` mock staff → 403.
- [ ] Commit `feat(upload): guarded local image upload + serve route`.

---

### Task 5: UI danh sách sản phẩm (bảng server) + xoá + chỉnh tồn nhanh

**Files:**
- Create: `src/app/admin/products/page.tsx` — Server Component: `await requireAdmin()`; query `prisma.product.findMany` kèm `category`, `_count.variants`, tổng `stock` (aggregate/`include variants`), ảnh đầu; render `<table>` (tên, danh mục, giá `formatVnd`, trạng thái, tổng tồn, số biến thể); link "Sửa" `/admin/products/[id]/edit`, nút "Thêm sản phẩm" → `/admin/products/new`; **sort cơ bản** qua `?sort=` (vd name/createdAt) đọc từ `searchParams`.
- Create: `src/components/admin/delete-product-button.tsx` (`"use client"`) — nút xoá gọi `deleteProductAction` (form action) kèm xác nhận (`confirm()` hoặc dialog tối giản).
- Create: `src/components/admin/stock-quick-edit.tsx` (`"use client"`) — input số + nút lưu gọi `updateVariantStockAction` (dùng ở trang edit hoặc list; đặt ở list nếu gọn).
- Modify: `src/app/admin/page.tsx` — thêm link vào "Quản lý sản phẩm".
- Dùng `src/lib/money.ts::formatVnd` để hiển thị giá.

**TDD / bằng chứng:**
- [ ] E2E-lite (có thể gộp vào spec Task 6): sau đăng nhập owner, `/admin/products` hiển thị các sản phẩm seed (đếm ≥ 1 hàng). (Không viết test trùng lặp nếu Task 6 đã phủ.)
- [ ] `npm run build` ok (trang `/admin/products` là dynamic vì `requireAdmin`).
- [ ] Commit `feat(admin): product list page + delete + quick stock edit`.

**Lưu ý:** không bắt buộc thêm shadcn `table`; `<table>` semantic + Tailwind là đủ cho bảng server. Nếu thêm form control, ưu tiên `npx shadcn@latest add input label`; nếu registry trục trặc, tự viết control tối giản bằng tokens.

---

### Task 6: Form tạo/sửa sản phẩm (biến thể inline + upload ảnh) + E2E headline

**Files:**
- Create: `src/components/admin/product-form.tsx` (`"use client"`) — form dùng chung create/edit:
  - Field sản phẩm: name, description, categoryId (select từ categories truyền vào props), basePrice (số), status (select).
  - **Biến thể inline:** danh sách dòng, mỗi dòng size/color/sku/priceOverride/stock; nút "Thêm biến thể" / "Xoá dòng" (state client, tối thiểu 1 dòng).
  - **Upload ảnh:** `<input type="file">` → `fetch("/api/admin/upload", {method:"POST", body: FormData})` → nhận `{url}` → thêm vào danh sách ảnh (hiện preview); url gửi kèm khi submit.
  - Submit: build `FormData` (hoặc gọi action với payload đã serialize) → `createProductAction`/`updateProductAction`. Hiển thị lỗi validate tiếng Việt.
- Create: `src/app/admin/products/new/page.tsx` — Server Component: `requireAdmin()`; load categories; render `<ProductForm mode="create" />`.
- Create: `src/app/admin/products/[id]/edit/page.tsx` — `requireAdmin()`; load product + variants + images + categories; render `<ProductForm mode="edit" initial=… />`.
- Create test: `src/components/admin/product-form.test.tsx` (RTL) — thêm/xoá dòng biến thể hoạt động (số dòng tăng/giảm; không xoá được dòng cuối).
- Create E2E: `e2e/admin-products.spec.ts` — **headline Ngày 3**.

**E2E headline (Playwright):**
- [ ] Đăng nhập bằng owner seed (điền form `/login` → submit → tới `/admin`). *(Chứng minh Task 1: seed user + disableSignUp + login + guard.)*
- [ ] Vào `/admin/products` → "Thêm sản phẩm" → điền tên (vd "Giày Thử Nghiệm E2E"), giá, chọn danh mục, chọn status; thêm 1 biến thể (size 40, màu Đen, sku duy nhất, tồn 10). (Upload ảnh: có thể bỏ qua để test ổn định, hoặc set 1 file fixture nhỏ — quyết định lúc implement, ưu tiên độ ổn định.)
- [ ] Submit → về `/admin/products` → **thấy sản phẩm mới trong bảng** (assert text tên + tồn/biến thể).
- [ ] (tuỳ chọn) Vào edit → đổi tồn → lưu → thấy tồn mới.

**Chuẩn bị E2E:** cần DB có owner seed + ít nhất 1 category. Playwright chạy trên DB dev (đã seed) hoặc cấu hình webServer + seed trước. Dùng credential owner từ env (không hardcode secret trong spec — đọc `process.env` trong test config, hoặc dùng giá trị dev-default thống nhất với seed). Đảm bảo cleanup/không phụ thuộc thứ tự (tên sản phẩm E2E có hậu tố ngẫu nhiên để chạy lại được).

- [ ] Commit `feat(admin): product create/edit form with inline variants + image upload; day3 e2e`.

---

## Thứ tự thực thi & phụ thuộc

```
Task1 (auth/seed/login) ─┐
Task2 (slug+zod) ────────┼→ Task3 (product actions) ─┐
                         └→ Task4 (upload route) ─────┼→ Task5 (list UI) → Task6 (form UI + E2E)
                                                       ┘
```

1 và 2 độc lập (làm trước). 3 cần 2. 4 độc lập (chỉ cần 1 cho authz). 5,6 cần 1+3+4.

## Cổng test cuối ngày (bắt buộc xanh)

- `npm run test` — unit (slug, zod, upload) + integration (product core DB thật) + authz + RTL form đều xanh.
- `npm run build` — ok; routes mới: `/admin/products`, `/admin/products/new`, `/admin/products/[id]/edit`, `/api/admin/upload`, `/api/uploads/[...path]`.
- `npx prisma migrate status` up-to-date (không đổi schema Ngày 3 → không migration mới).
- `npx prisma db seed` sạch + idempotent (gồm seed owner/staff).
- E2E: `e2e/admin-products.spec.ts` pass + `e2e/admin-guard.spec.ts` (Ngày 2) vẫn pass.

## Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| `auth.api.createUser` server-side hành vi khác kỳ vọng | Đã verify từ source better-auth; nếu lỗi, fallback: tạo user qua `signUpEmail` **trước** khi bật disableSignUp, hoặc hash bằng `auth.$context.password.hash` + tạo `user`+`account` trực tiếp. |
| Ghi file lúc build/standalone (Next `public/`) | Không ghi vào `public/`; dùng `UPLOAD_DIR` + serve route → độc lập build, map Docker volume Ngày 10. |
| Đồng bộ biến thể khi edit phức tạp | Ngày 3 dùng chiến lược đơn giản (xoá thiếu + upsert theo sku); ghi chú rõ; nâng cấp sau nếu cần. |
| Server Action authz bị quên | Global Constraint #MUST-FIX #2 + authz test staff-denied là cổng; reviewer soi từng action. |
| E2E phụ thuộc dữ liệu seed | Tên sản phẩm E2E có hậu tố ngẫu nhiên; assert theo tên đó; seed owner + category đảm bảo tồn tại. |
| shadcn registry trục trặc khi add component | Fallback control tối giản bằng Tailwind + tokens sẵn có. |
```
