# Day 2 — Data model đầy đủ + seed + guard RBAC (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: dùng superpowers:subagent-driven-development (khuyến nghị) hoặc superpowers:executing-plans để thực thi plan này task-by-task. Các bước dùng checkbox (`- [ ]`) để theo dõi.
>
> **⚠️ Đây KHÔNG phải Next.js bạn từng biết.** Repo dùng **Next.js 16** — có breaking changes so với training data. Đọc guide trong `node_modules/next/dist/docs/` trước khi viết code. Điểm quan trọng nhất cho ngày này: **`middleware.ts` đã bị đổi tên thành `proxy.ts`** (hàm export tên `proxy`, mặc định chạy Node.js runtime). Xem `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.

**Goal:** Hoàn thiện toàn bộ schema nghiệp vụ (Category, Product, ProductImage, Variant, Order, OrderItem, Payment, ShippingZone, ProvinceZone) + migration; script seed dữ liệu mẫu (danh mục, sản phẩm có biến thể size/màu, zone phí ship cho toàn bộ tỉnh); guard RBAC chặn non-admin vào khu `/admin`. Tất cả có test thật (unit + integration + E2E redirect).

**Architecture:** Vẫn là monolith Next.js App Router (TypeScript). Prisma 7 (`prisma-client` generator, datasource không url, driver adapter `@prisma/adapter-pg`) — như Ngày 1. RBAC hai lớp:
1. **`src/proxy.ts`** (thay cho `middleware.ts`): kiểm tra *lạc quan* sự tồn tại của session cookie để redirect nhanh non-auth khỏi `/admin`. **Không phải chốt bảo mật.**
2. **`src/app/admin/layout.tsx`** (Server Component): chốt bảo mật thật — `auth.api.getSession()` + kiểm tra role bằng `can()`; không đạt → redirect.
3. **`src/lib/rbac.ts`**: helper thuần `can(role, resource, action)` (unit test được, không I/O), bọc `roles` đã định nghĩa ở `src/lib/permissions.ts` (single source of truth).

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Prisma 7 + PostgreSQL (local Homebrew), Better Auth 1.6 (admin plugin + access-control), Vitest, Playwright, `tsx` (chạy seed).

## Global Constraints

- Package manager **npm**. **TypeScript strict**.
- **Tiền = số nguyên VND** (đồng), không float. Trường tiền: `Int`.
- **Font đủ dấu tiếng Việt** (đã có Be Vietnam Pro — không đụng ở ngày này).
- **Commit mỗi task**, Conventional Commits (`feat:`, `test:`, `chore:`).
- **Đọc docs Next.js 16 trong `node_modules/next/dist/docs/` trước khi viết `proxy.ts` / layout / route.**
- Prisma: KHÔNG sửa 4 model auth (`User/Session/Account/Verification`) — Better Auth quản. Chỉ *thêm* model nghiệp vụ.
- Client Prisma sinh ra nằm ở `src/generated/prisma` (gitignored) — sau mỗi lần đổi schema phải `npx prisma generate` (migrate dev tự chạy generate).
- **Cổng test cuối ngày:** `npm run test` xanh (gồm unit + integration), `npm run build` ok, `npx prisma migrate status` up-to-date, `npx prisma db seed` chạy sạch, E2E redirect guard pass.

## Hiện trạng đầu Ngày 2 (đã có từ Ngày 1)

- `prisma/schema.prisma`: generator `prisma-client` (output `../src/generated/prisma`), datasource `postgresql` **không có `url`**; 4 model auth.
- `prisma.config.ts`: `import "dotenv/config"`, `defineConfig({ schema, migrations:{path}, datasource:{url: process.env["DATABASE_URL"]} })`.
- `src/lib/prisma.ts`: singleton `PrismaClient` + `PrismaPg` adapter đọc `DATABASE_URL`.
- `src/lib/permissions.ts`: `createAccessControl` với statement `{ product:[create,read,update,delete], order:[read,update] }`; roles `owner` (full) và `staff` (`product:[read]`, `order:[read,update]`); export `ac`, `owner`, `staff`, `roles`.
- `src/lib/auth.ts`: `betterAuth` + `prismaAdapter` + plugin `admin({ ac, roles, defaultRole:"staff", adminRoles:["owner"] })`.
- DB dev: `leafshoes_development` (Postgres local, user `nam`, trust auth). Migration `20260722163752_init_auth` đã apply.
- Chưa có: model nghiệp vụ, seed, `src/proxy.ts`, `src/lib/rbac.ts`, khu `/admin`, DB test.

---

### Task 1: Thêm toàn bộ model nghiệp vụ vào schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (thêm models + enums nghiệp vụ)
- Create (auto): `prisma/migrations/<timestamp>_business_models/migration.sql`

**Mục tiêu:** schema khớp `docs/03-data-model.md`, migrate sạch, client generate lại và `npm run build` vẫn ok. Đây là task hạ tầng — "test" là migrate + validate + build (chưa có logic để unit test).

- [ ] **Step 1 (red-ish): Thêm models vào `prisma/schema.prisma`**

Thêm (giữ nguyên phần generator/datasource/auth). Chép sát `docs/03-data-model.md`:

```prisma
model Category {
  id       String     @id @default(cuid())
  name     String
  slug     String     @unique
  parentId String?
  parent   Category?  @relation("CategoryTree", fields: [parentId], references: [id])
  children Category[] @relation("CategoryTree")
  products Product[]
  @@map("category")
}

enum ProductStatus { DRAFT ACTIVE ARCHIVED }

model Product {
  id          String         @id @default(cuid())
  name        String
  slug        String         @unique
  description String?
  categoryId  String
  category    Category       @relation(fields: [categoryId], references: [id])
  basePrice   Int            // VND, số nguyên
  status      ProductStatus  @default(DRAFT)
  images      ProductImage[]
  variants    Variant[]
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  @@index([categoryId])
  @@index([status])
  @@map("product")
}

model ProductImage {
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  url       String
  position  Int     @default(0)
  @@index([productId])
  @@map("product_image")
}

model Variant {
  id            String      @id @default(cuid())
  productId     String
  product       Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  size          String
  color         String
  sku           String      @unique
  priceOverride Int?
  stock         Int         @default(0)
  orderItems    OrderItem[]
  @@unique([productId, size, color])
  @@index([productId])
  @@map("variant")
}

enum OrderStatus { PENDING_PAYMENT PAID FULFILLED COMPLETED CANCELLED EXPIRED }

model Order {
  id           String      @id @default(cuid())
  orderCode    String      @unique
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
  items        OrderItem[]
  payments     Payment[]
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  @@index([email])
  @@index([status])
  @@map("order")
}

model OrderItem {
  id          String  @id @default(cuid())
  orderId     String
  order       Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  variantId   String
  variant     Variant @relation(fields: [variantId], references: [id])
  productName String
  size        String
  color       String
  unitPrice   Int
  quantity    Int
  @@index([orderId])
  @@map("order_item")
}

model Payment {
  id            String   @id @default(cuid())
  orderId       String
  order         Order    @relation(fields: [orderId], references: [id])
  provider      String   // "sepay" | "manual"
  transactionId String   @unique
  amount        Int
  rawPayload    Json?
  matchedAt     DateTime @default(now())
  @@index([orderId])
  @@map("payment")
}

model ShippingZone {
  id        String         @id @default(cuid())
  name      String         @unique   // unique để upsert seed idempotent
  fee       Int
  isDefault Boolean        @default(false) // zone fallback khi tỉnh không map
  provinces ProvinceZone[]
  @@map("shipping_zone")
}

model ProvinceZone {
  id       String       @id @default(cuid())
  province String       @unique
  zoneId   String
  zone     ShippingZone @relation(fields: [zoneId], references: [id])
  @@index([zoneId])
  @@map("province_zone")
}
```

> Ghi chú: dùng `@@map` snake_case cho đồng bộ với các bảng auth đã map (`user`, `session`…). `onDelete: Cascade` cho image/variant/orderItem; **không** cascade cho `Payment→Order` và `OrderItem→Variant` (giữ lịch sử).

- [ ] **Step 2 (green): Tạo migration + generate**

```bash
npx prisma validate
npx prisma migrate dev --name business_models
```

Kỳ vọng: tạo `prisma/migrations/<ts>_business_models/`, apply vào `leafshoes_development`, tự `prisma generate`.

- [ ] **Step 3: Xác minh build còn xanh**

```bash
npx tsc --noEmit
npm run build
```

**Acceptance:** `prisma migrate status` = up to date; `prisma validate` ok; `npm run build` ok. Commit: `feat: add full business data model + migration`.

---

### Task 2: RBAC helper thuần `can()` (TDD đỏ→xanh)

**Files:**
- Test: `src/lib/rbac.test.ts`
- Create: `src/lib/rbac.ts`

**Interfaces (produces):**
- `type AppRole = "owner" | "staff"`
- `can(role: string | null | undefined, resource: Resource, action: string): boolean` — thuần, không I/O. Nguồn quyền: `roles` trong `src/lib/permissions.ts`.
- `isAdminRole(role): boolean` — true nếu role ∈ {owner, staff}.

- [ ] **Step 1 (red): Viết `src/lib/rbac.test.ts` trước**

Ca kiểm thử tối thiểu:
```ts
import { describe, it, expect } from "vitest";
import { can, isAdminRole } from "@/lib/rbac";

describe("can()", () => {
  it("owner có full quyền product", () => {
    expect(can("owner", "product", "create")).toBe(true);
    expect(can("owner", "product", "delete")).toBe(true);
  });
  it("staff chỉ đọc product, không tạo/xoá", () => {
    expect(can("staff", "product", "read")).toBe(true);
    expect(can("staff", "product", "create")).toBe(false);
    expect(can("staff", "product", "delete")).toBe(false);
  });
  it("staff đọc + cập nhật order", () => {
    expect(can("staff", "order", "read")).toBe(true);
    expect(can("staff", "order", "update")).toBe(true);
  });
  it("role không hợp lệ / null → false", () => {
    expect(can(null, "product", "read")).toBe(false);
    expect(can("ghost", "product", "read")).toBe(false);
  });
});

describe("isAdminRole()", () => {
  it("owner & staff là admin", () => {
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("staff")).toBe(true);
  });
  it("khác → không phải admin", () => {
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole("customer")).toBe(false);
  });
});
```
Chạy `npm test` → đỏ (chưa có module).

- [ ] **Step 2 (green): Viết `src/lib/rbac.ts`**

Bọc `roles` từ `permissions.ts` (single source of truth). Role của access-control có method `.authorize({ [resource]: [action] })` trả `{ success: boolean }`. Ví dụ hướng triển khai (verify API thực tế của `better-auth/plugins/access` khi code — object role có `authorize`/`statements`):

```ts
import { roles } from "@/lib/permissions";

export type AppRole = keyof typeof roles; // "owner" | "staff"
export type Resource = "product" | "order";

export function isAdminRole(role: string | null | undefined): role is AppRole {
  return role === "owner" || role === "staff";
}

export function can(
  role: string | null | undefined,
  resource: Resource,
  action: string,
): boolean {
  if (!isAdminRole(role)) return false;
  const result = roles[role].authorize({ [resource]: [action] });
  return result.success === true;
}
```

> Nếu API `.authorize()` khác với giả định trên, tra cứu bằng ctx7 (`better-auth` — "access control role authorize statements") và điều chỉnh. Mục tiêu bất biến: `can()` thuần, lấy quyền từ `permissions.ts`, test ở Step 1 phải xanh.

- [ ] **Step 3 (refactor):** đảm bảo type an toàn, không `any`. `npm test` xanh phần rbac.

**Acceptance:** rbac test xanh. Commit: `feat: add pure can() RBAC helper wrapping permissions`.

---

### Task 3: Harness DB test + seed script + seed test (integration TDD)

**Files:**
- Modify: `.env`, `.env.example` (thêm `DATABASE_URL_TEST`)
- Modify: `package.json` (devDep `tsx`; script `db:seed`, `db:test:setup`)
- Modify: `prisma.config.ts` (thêm `migrations.seed`)
- Create: `prisma/data/provinces.ts` (danh sách tỉnh → tên zone)
- Create: `prisma/seed.ts` (export `seed(prisma)` + entry CLI)
- Create: `src/test/db.ts` (client Prisma trỏ DB test + helper truncate)
- Create: `vitest.globalSetup.ts` (migrate deploy vào DB test)
- Modify: `vitest.config.ts` (đăng ký `globalSetup`)
- Test: `prisma/seed.test.ts` (integration)

**Mục tiêu:** seed idempotent tạo đúng dữ liệu; test chạy trên DB `leafshoes_test` thật.

- [ ] **Step 1: Tạo DB test + biến môi trường**

```bash
createdb leafshoes_test
```
Thêm vào `.env` **và** `.env.example` (ở example để giá trị placeholder/đúng convention local):
```
DATABASE_URL_TEST="postgresql://nam@localhost:5432/leafshoes_test?schema=public"
```

- [ ] **Step 2: Cài `tsx` + wiring seed command**

```bash
npm i -D tsx
```
`prisma.config.ts` — thêm `seed` vào `migrations` (Prisma 7 đọc `migrations.seed`):
```ts
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: { url: process.env["DATABASE_URL"] },
});
```
`package.json` scripts:
```json
"db:seed": "prisma db seed",
"db:test:setup": "dotenv -e .env -- cross-env DATABASE_URL=$DATABASE_URL_TEST prisma migrate deploy"
```
> Không muốn thêm `dotenv-cli`/`cross-env`? Thay bằng script Node đọc `.env` rồi spawn `prisma migrate deploy` với `DATABASE_URL=DATABASE_URL_TEST`. **Cách được ưu tiên:** thực hiện việc migrate DB test trong `vitest.globalSetup.ts` (Step 5) để không phụ thuộc CLI env — khi đó bỏ script `db:test:setup`.

- [ ] **Step 3: `prisma/data/provinces.ts` — danh sách tỉnh → zone**

**Quyết định của người dùng:** tập nhỏ **3 tỉnh** (TP.HCM, Đồng Nai, Tây Ninh); tỉnh **không map → dùng zone mặc định (phí cố định)**.

Xuất zones + mảng phẳng `{ province, zone }`. Đúng 1 zone có `isDefault: true` làm fallback:
```ts
export const SHIPPING_ZONES = [
  { name: "TP.HCM & lân cận", fee: 25000, isDefault: false },
  { name: "Mặc định (tỉnh khác)", fee: 35000, isDefault: true }, // fallback, KHÔNG gắn tỉnh nào
] as const;

export type ZoneName = (typeof SHIPPING_ZONES)[number]["name"];

// Chỉ 3 tỉnh được map tường minh; còn lại rơi vào zone isDefault (xử lý ở Ngày 5).
export const PROVINCE_ZONES: { province: string; zone: ZoneName }[] = [
  { province: "TP. Hồ Chí Minh", zone: "TP.HCM & lân cận" },
  { province: "Đồng Nai", zone: "TP.HCM & lân cận" },
  { province: "Tây Ninh", zone: "TP.HCM & lân cận" },
];
```
> **Zone mặc định (fallback):** Ngày 2 chỉ *tạo* dữ liệu. Logic "tra ProvinceZone theo tỉnh; không có → dùng zone `isDefault`" thuộc **Ngày 5** (checkout). Bất biến ở Ngày 2: có đúng 1 zone `isDefault: true`, và `PROVINCE_ZONES.length` (= 3) province được map.

- [ ] **Step 4 (red): Viết `prisma/seed.test.ts` trước**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, resetDb } from "@/test/db";
import { seed } from "../prisma/seed";
import { PROVINCE_ZONES } from "../prisma/data/provinces";

describe("seed()", () => {
  beforeEach(async () => { await resetDb(); });

  it("tạo danh mục, sản phẩm có biến thể, và zone phí ship", async () => {
    await seed(testPrisma);
    expect(await testPrisma.category.count()).toBeGreaterThan(0);
    const products = await testPrisma.product.count();
    expect(products).toBeGreaterThan(0);
    // mỗi sản phẩm có ≥ 1 biến thể
    const productsWithVariants = await testPrisma.product.findMany({ include: { variants: true } });
    expect(productsWithVariants.every((p) => p.variants.length > 0)).toBe(true);
    // 3 tỉnh được map; và có đúng 1 zone mặc định (fallback)
    expect(await testPrisma.provinceZone.count()).toBe(PROVINCE_ZONES.length); // = 3
    expect(await testPrisma.shippingZone.count({ where: { isDefault: true } })).toBe(1);
  });

  it("idempotent: chạy 2 lần không nhân đôi dữ liệu", async () => {
    await seed(testPrisma);
    const c1 = await testPrisma.provinceZone.count();
    await seed(testPrisma);
    const c2 = await testPrisma.provinceZone.count();
    expect(c2).toBe(c1);
  });
});
```
Chạy → đỏ.

- [ ] **Step 5 (green): Harness DB test**

`src/test/db.ts` — client trỏ DB test + reset:
```ts
import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL_TEST;
if (!url) throw new Error("DATABASE_URL_TEST chưa được cấu hình");

export const testPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

// Xoá dữ liệu nghiệp vụ theo thứ tự FK (không đụng bảng auth).
export async function resetDb() {
  await testPrisma.$executeRawUnsafe(
    `TRUNCATE "order_item","payment","order","variant","product_image","product","category","province_zone","shipping_zone" RESTART IDENTITY CASCADE;`,
  );
}
```
`vitest.globalSetup.ts` — migrate DB test 1 lần trước cả suite:
```ts
import { execSync } from "node:child_process";
export default function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST chưa cấu hình");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
```
`vitest.config.ts` — thêm `test.globalSetup: ["./vitest.globalSetup.ts"]` (giữ nguyên `environment`, `setupFiles`, alias, exclude `e2e/**`).

> Lưu ý: seed & rbac test không cần jsdom, nhưng để đơn giản giữ 1 config. Nếu muốn tách "node" vs "jsdom" bằng Vitest projects/workspace là tuỳ chọn refactor — **không bắt buộc** cho demo.

- [ ] **Step 6 (green): Viết `prisma/seed.ts`**

Idempotent bằng `upsert` (khoá tự nhiên: category.slug, product.slug, variant.sku, province.province, zone.name). Export `seed(prisma)` để test import; entry CLI để `tsx prisma/seed.ts` chạy được:

```ts
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { SHIPPING_ZONES, PROVINCE_ZONES } from "./data/provinces";

type Db = PrismaClient;

export async function seed(prisma: Db) {
  // 1) Zones (upsert theo name — đã unique) + provinces
  for (const z of SHIPPING_ZONES) {
    await prisma.shippingZone.upsert({
      where: { name: z.name },
      update: { fee: z.fee, isDefault: z.isDefault },
      create: { name: z.name, fee: z.fee, isDefault: z.isDefault },
    });
  }
  for (const pz of PROVINCE_ZONES) {
    const zone = await prisma.shippingZone.findUniqueOrThrow({ where: { name: pz.zone } });
    await prisma.provinceZone.upsert({
      where: { province: pz.province },
      update: { zoneId: zone.id },
      create: { province: pz.province, zoneId: zone.id },
    });
  }
  // 2) Categories (upsert theo slug)
  // 3) Products (upsert theo slug) + Variants (upsert theo sku)
}

if (process.argv[1] && process.argv[1].includes("seed")) {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  seed(prisma).then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
}
```

> **Khoá upsert:** `ShippingZone.name` đã `@unique` (Task 1) nên upsert theo `name` an toàn/idempotent. Đúng 1 zone `isDefault: true` (fallback, không gắn tỉnh).

- [ ] **Step 7:** `npm test` → seed test xanh. Rồi chạy seed vào DB dev thật:
```bash
npx prisma db seed
```

**Acceptance:** seed test (integration) xanh; `npx prisma db seed` chạy sạch trên `leafshoes_development`; chạy lần 2 không nhân đôi. Commit: `feat: add seed data (categories, products, shipping zones) + db test harness`.

---

### Task 4: Guard RBAC — `proxy.ts` + khu `/admin` + chốt bảo mật ở layout (TDD)

> **BẮT BUỘC đọc trước khi code:** `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` và `node_modules/next/dist/docs/01-app/02-guides/authentication.md`. Ở Next 16: file là **`proxy.ts`**, export hàm **`proxy`**, có `export const config = { matcher }`. Mặc định Node.js runtime.

**Files:**
- Create: `src/proxy.ts` (redirect lạc quan cho `/admin`)
- Test: `src/proxy.test.ts` (dùng `next/experimental/testing/server`)
- Create: `src/app/admin/layout.tsx` (chốt bảo mật thật: session + role)
- Create: `src/app/admin/page.tsx` (placeholder "Bảng điều khiển")
- Create: `src/app/login/page.tsx` (stub — nơi redirect tới; UI đăng nhập thật để Ngày 3)
- Create: `src/lib/auth-guard.ts` (helper server: `requireAdmin()`)
- Test (E2E): `e2e/admin-guard.spec.ts`

> **Vì sao dùng `/admin` (segment thật) thay vì chỉ route group `(admin)`:** route group `(admin)` **không** tạo tiền tố URL → không thể `matcher` theo path. Ta dùng segment thật `src/app/admin/*` (matcher `'/admin/:path*'`). Layout `admin/layout.tsx` bọc toàn khu để guard tập trung.

- [ ] **Step 1 (red): `src/proxy.test.ts`**

Dùng tiện ích test proxy của Next (`unstable_doesProxyMatch`) + gọi hàm proxy trực tiếp:
```ts
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("proxy admin guard", () => {
  it("không có session cookie → redirect khỏi /admin", async () => {
    const req = new NextRequest("http://localhost/admin");
    const res = await proxy(req);
    expect(res?.status).toBe(307); // redirect
    expect(res?.headers.get("location")).toContain("/login");
  });
});
```
> Có thể bổ sung test bằng `unstable_doesProxyMatch({ config, url })` để khẳng định matcher trúng `/admin` và **không** trúng `/`. Kiểm tra tên export chính xác trong `next/experimental/testing/server` khi viết (đọc mục "Unit testing" trong `proxy.md`).

- [ ] **Step 2 (green): `src/proxy.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  // Kiểm tra LẠC QUAN (không phải chốt bảo mật): chỉ redirect nhanh khi thiếu cookie.
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

- [ ] **Step 3 (green): chốt bảo mật thật — `src/lib/auth-guard.ts` + `admin/layout.tsx`**

`src/lib/auth-guard.ts`:
```ts
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/rbac";

export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (!isAdminRole(session.user.role)) redirect("/"); // đã đăng nhập nhưng không đủ quyền
  return session;
}
```
`src/app/admin/layout.tsx` (Server Component):
```tsx
import { requireAdmin } from "@/lib/auth-guard";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin(); // chốt bảo mật: session thật + role
  return <section>{children}</section>;
}
```
`src/app/admin/page.tsx`: placeholder tiếng Việt ("Bảng điều khiển"). `src/app/login/page.tsx`: stub ("Đăng nhập — sẽ hoàn thiện Ngày 3").

> `session.user.role` do plugin admin của Better Auth thêm. Nếu type không có `role`, kiểm tra cách infer type session (ctx7 `better-auth` — "admin plugin session user role type") hoặc ép kiểu an toàn tối thiểu.

- [ ] **Step 4 (red→green E2E): `e2e/admin-guard.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("khách chưa đăng nhập bị chặn khỏi /admin", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
});
```
Chạy `npm run test:e2e` (Playwright build+start theo `playwright.config.ts` đã có).

> **Phạm vi guard Ngày 2:** unit-test `can()` đầy đủ (owner vs staff) + E2E redirect **khách chưa đăng nhập**. Phân biệt redirect **staff vs owner** cho hành động nhạy cảm cần user đăng nhập → **hoãn sang Ngày 3** (khi có UI đăng nhập + tạo user). Ghi rõ điều này trong ledger, không giả vờ đã phủ.

**Acceptance:** proxy unit test xanh; E2E redirect pass; `npm run build` ok (proxy + layout biên dịch). Commit: `feat: add /admin RBAC guard (proxy + server-side layout check)`.

---

### Task 5: Cổng test cuối ngày + cập nhật tài liệu

**Files:**
- Modify: `docs/plans/README.md` (điền link plan Ngày 2 vào cột "Plan chi tiết", đánh dấu test gate)

- [ ] **Step 1: Chạy toàn bộ cổng test (bằng chứng thật)**
```bash
npm run test          # unit (money, permissions, prisma, rbac) + integration (seed) — xanh
npm run build         # ok
npx prisma migrate status   # up to date
npx prisma db seed    # chạy sạch, idempotent
npm run test:e2e      # home smoke + admin-guard redirect — pass
```
Ghi lại kết quả thật (số test pass/fail) vào ledger.

- [ ] **Step 2: Cập nhật `docs/plans/README.md`** — hàng Ngày 2: link `2026-07-23-day2-data-model.md`; test gate = "unit rbac + integration seed xanh; E2E `/admin` redirect pass; migrate + seed ok".

**Acceptance:** tất cả cổng xanh với bằng chứng thật. Commit: `docs: link day 2 plan + mark test gate`.

---

## Thứ tự phụ thuộc giữa các task

```
Task 1 (schema+migration)
   ├─→ Task 2 (rbac can) [độc lập, chỉ cần permissions.ts — có thể làm song song]
   ├─→ Task 3 (seed + db test)  [cần Task 1: model + client]
   └─→ Task 4 (guard)           [cần Task 2: isAdminRole/can]
Task 5 (gate + docs)            [cần 1–4]
```

## Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Quen `middleware.ts` cũ → sai file ở Next 16 | Dùng **`proxy.ts`** + hàm `proxy`; đọc `proxy.md`. Có codemod `npx @next/codemod middleware-to-proxy .` nếu lỡ tạo nhầm. |
| Proxy bị hiểu là chốt bảo mật | Redirect ở proxy chỉ *lạc quan*; **chốt thật** ở `admin/layout.tsx` bằng `auth.api.getSession` + `isAdminRole`. |
| Prisma 7 seed không chạy | Cấu hình `migrations.seed` trong `prisma.config.ts`; seed tự dựng client với `PrismaPg` (datasource không url). |
| DB test làm chậm/rối test thuần | `globalSetup` migrate DB test 1 lần; `resetDb()` TRUNCATE trước mỗi test integration. |
| Tỉnh không map phí ship | Zone `isDefault: true` làm fallback; logic tra cứu ở Ngày 5. Ngày 2 chỉ seed 3 tỉnh + 1 zone mặc định. |
| `session.user.role` thiếu type | Tra ctx7 cách infer type; ép kiểu tối thiểu an toàn. |

## Ngoài phạm vi Ngày 2 (để ngày sau)

- UI đăng nhập/đăng ký admin + tạo user owner/staff (**Ngày 3**) → E2E phân biệt staff vs owner hoãn tới đó.
- CRUD sản phẩm/biến thể, upload ảnh (**Ngày 3**).
- Query storefront (lọc/search) (**Ngày 4**).
- Tính phí ship từ `ProvinceZone` khi checkout (**Ngày 5**) — Ngày 2 chỉ tạo dữ liệu zone.
