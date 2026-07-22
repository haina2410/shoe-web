# Day 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng bộ khung leafshoes chạy được với test harness thật (Vitest + Playwright), Postgres qua Docker + Prisma, Better Auth + RBAC (OWNER/STAFF), và design tokens/layout gốc.

**Architecture:** Một Next.js App Router (TypeScript) monolith. Dev dùng **Postgres local (Homebrew)**; production dùng Docker Compose (Ngày 10). Truy cập DB bằng Prisma singleton. Better Auth dùng Prisma adapter + plugin `admin` cho RBAC. UI nền shadcn/ui + Tailwind với tokens thương hiệu leafshoes.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Prisma, PostgreSQL, Better Auth, Vitest, @testing-library/react, Playwright.

## Global Constraints

- Runtime: **Node 20 LTS**. Package manager: **npm**.
- **TypeScript strict** = true (mặc định create-next-app).
- **Tiền lưu số nguyên VND** (đồng), không dùng float cho tiền.
- **Font bắt buộc đủ dấu tiếng Việt** — dùng `Be Vietnam Pro` (next/font/google).
- **Commit mỗi task**. Message theo Conventional Commits (`feat:`, `chore:`, `test:`).
- **Cổng test cuối ngày:** `npm run test` xanh, `npm run build` ok, `prisma migrate` ok, `npm run test:e2e` (smoke) pass.
- Design tokens lấy từ `docs/05-design-direction.md` (paper `#FAFAF7`, ink `#171717`, evergreen `#1B4332`, sage `#DCE7DF`, line `#E7E5E0`, accent `#2D6A4F`).

---

### Task 1: Scaffold Next.js + thiết lập test harness (Vitest)

**Files:**
- Create (scaffold): toàn bộ khung Next.js trong thư mục dự án
- Create: `src/lib/money.ts`
- Test: `src/lib/money.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces: `formatVnd(amount: number): string` — định dạng số nguyên VND, VD `250000 → "250.000 ₫"`.

- [ ] **Step 1: Scaffold Next.js vào thư mục hiện tại**

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir --import-alias "@/*" --no-turbopack
```
Khi được hỏi ghi đè do đã có `docs/`, chọn giữ lại (`docs/` không xung đột với scaffold). Kết quả: có `src/app/`, `package.json`, `tsconfig.json`.

- [ ] **Step 2: Cài Vitest + thư viện test**

Run:
```bash
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Tạo `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

Và `vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Thêm script test vào `package.json`**

Trong `"scripts"` thêm:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Viết test đỏ cho `formatVnd`**

Create `src/lib/money.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatVnd } from "./money";

describe("formatVnd", () => {
  it("định dạng số nguyên VND với dấu chấm phân cách nghìn và ký hiệu ₫", () => {
    expect(formatVnd(250000)).toBe("250.000 ₫");
  });

  it("xử lý số 0", () => {
    expect(formatVnd(0)).toBe("0 ₫");
  });

  it("xử lý số lớn", () => {
    expect(formatVnd(1250000)).toBe("1.250.000 ₫");
  });
});
```

- [ ] **Step 6: Chạy test để xác nhận ĐỎ**

Run: `npm run test`
Expected: FAIL — `Cannot find module './money'` (chưa tạo file).

- [ ] **Step 7: Viết implementation tối thiểu**

Create `src/lib/money.ts`:
```ts
/** Định dạng số nguyên VND (đồng) sang chuỗi hiển thị, VD 250000 -> "250.000 ₫". */
export function formatVnd(amount: number): string {
  const grouped = new Intl.NumberFormat("vi-VN").format(Math.round(amount));
  return `${grouped} ₫`;
}
```

- [ ] **Step 8: Chạy test để xác nhận XANH**

Run: `npm run test`
Expected: PASS (3 test).

- [ ] **Step 9: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js + vitest harness with formatVnd util"
```
> Nếu repo đã init thì bỏ dòng `git init`.

---

### Task 2: Postgres (local dev) + Prisma + kiểm tra kết nối

> **Local dev dùng Postgres cài sẵn trên máy** (Homebrew PostgreSQL 17, đang chạy port 5432, user `nam`, không mật khẩu, xác thực trust local). **KHÔNG tạo `docker-compose.yml` ở Ngày 1** — Postgres cho production sẽ chạy bằng Docker Compose ở **Ngày 10**.

**Files:**
- Create: `prisma/schema.prisma` (qua `prisma init`)
- Create: `src/lib/prisma.ts`
- Create/Modify: `.env` (DATABASE_URL trỏ Postgres local — không commit)
- Create/Modify: `.env.example` (mẫu, commit được)
- Test: `src/lib/prisma.test.ts`

**Interfaces:**
- Produces: `prisma` — PrismaClient singleton export từ `@/lib/prisma`.

- [ ] **Step 1: Tạo database local**

Run: `createdb leafshoes_development`
Expected: tạo DB thành công. Nếu đã tồn tại thì bỏ qua (kiểm tra: `psql -lqt | cut -d '|' -f1 | grep -qw leafshoes_development && echo exists`).

> **Prisma 7** (bản `npm i` kéo về). Dùng đúng pattern Prisma 7: generator mới `prisma-client` (xuất ra thư mục), cấu hình URL qua `prisma.config.ts`, chạy runtime bằng driver adapter `@prisma/adapter-pg`. (Đã verify qua docs Prisma + Better Auth.)

- [ ] **Step 2: Cài Prisma 7 + adapter + init**

Run:
```bash
npm i -D prisma dotenv
npm i @prisma/client @prisma/adapter-pg
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 3: Đặt `DATABASE_URL` trong `.env` (Postgres local)**

`.env`:
```
DATABASE_URL="postgresql://nam@localhost:5432/leafshoes_development?schema=public"
```
Và `.env.example` (không chứa giá trị thật):
```
DATABASE_URL="postgresql://USER@localhost:5432/leafshoes_development?schema=public"
```

- [ ] **Step 4: Cấu hình `prisma/schema.prisma` (generator mới, datasource không url)**

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

- [ ] **Step 5: Tạo `prisma.config.ts` (URL cho CLI/migrate đọc từ env)**

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"] },
});
```

- [ ] **Step 6: Gitignore client sinh ra + sinh client**

```bash
grep -q "src/generated" .gitignore || echo "/src/generated/" >> .gitignore
npx prisma generate
```
Expected: client sinh vào `src/generated/prisma`. Ghi lại đường dẫn import chính xác từ output (VD `@/generated/prisma/client`).

- [ ] **Step 7: Tạo Prisma singleton `src/lib/prisma.ts` (driver adapter)**

```ts
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```
> Nếu đường dẫn import từ generator khác (VD `@/generated/prisma`), sửa theo output thực tế của Step 6.

- [ ] **Step 8: Viết test kết nối**

Create `src/lib/prisma.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "./prisma";

describe("kết nối Postgres", () => {
  it("chạy được truy vấn đơn giản", async () => {
    const rows = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1::int AS ok`;
    expect(rows).toEqual([{ ok: 1 }]);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 9: Chạy test → XANH (Postgres local đang chạy)**

Run: `npm run test`
Expected: PASS. Nếu fail vì kết nối, kiểm tra `pg_isready` và `DATABASE_URL`.

- [ ] **Step 10: Xác nhận CLI đọc được URL (wiring `prisma.config.ts`)**

Run: `npx prisma migrate status`
Expected: kết nối được DB (báo "No migration found" / "up to date" là OK — chưa có model tới Task 3). Nếu lỗi kết nối → sai `prisma.config.ts`/`.env`.

- [ ] **Step 11: Commit**

```bash
# create-next-app đã gitignore .env* — xác nhận .env không bị commit
grep -q "^.env" .gitignore || echo ".env" >> .gitignore
git add -A
git commit -m "feat: add prisma 7 client (driver adapter) on local postgres"
```

---

### Task 3: Better Auth + RBAC (OWNER/STAFF)

**Files:**
- Create: `src/lib/permissions.ts`
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...all]/route.ts`
- Modify: `prisma/schema.prisma` (models auth sinh bởi Better Auth CLI)
- Test: `src/lib/permissions.test.ts`

**Interfaces:**
- Produces: `ac`, `owner`, `staff`, `roles` từ `@/lib/permissions`; `auth` từ `@/lib/auth`.
- Consumes: `prisma` từ Task 2.

- [ ] **Step 1: Cài Better Auth**

Run: `npm i better-auth`

- [ ] **Step 2: Viết test đỏ cho định nghĩa role**

Create `src/lib/permissions.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { roles } from "./permissions";

describe("RBAC roles", () => {
  it("định nghĩa role owner và staff", () => {
    expect(Object.keys(roles).sort()).toEqual(["owner", "staff"]);
  });
});
```

- [ ] **Step 3: Chạy test → ĐỎ**

Run: `npm run test`
Expected: FAIL — không import được `./permissions`.

- [ ] **Step 4: Tạo `src/lib/permissions.ts`**

```ts
import { createAccessControl } from "better-auth/plugins/access";

/** Các "statement" quyền theo tài nguyên của cửa hàng. */
const statement = {
  product: ["create", "read", "update", "delete"],
  order: ["read", "update"],
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  product: ["create", "read", "update", "delete"],
  order: ["read", "update"],
});

export const staff = ac.newRole({
  product: ["read"],
  order: ["read", "update"],
});

export const roles = { owner, staff };
```

- [ ] **Step 5: Chạy test → XANH**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 6: Tạo `src/lib/auth.ts`**

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";
import { ac, owner, staff } from "@/lib/permissions";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  plugins: [
    admin({
      ac,
      roles: { owner, staff },
      defaultRole: "staff",
      adminRoles: ["owner"],
    }),
  ],
});
```

- [ ] **Step 7: Tạo route handler `src/app/api/auth/[...all]/route.ts`**

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 8: Sinh model auth vào Prisma schema + migrate**

Run:
```bash
npx @better-auth/cli@latest generate --y
npx prisma migrate dev --name init_auth
```
Expected: schema có models `user`, `session`, `account`, `verification` (kèm field `role`, `banned`... của plugin admin); migration áp dụng thành công.
> Nếu CLI báo import adapter khác, làm theo output của CLI/doc Better Auth rồi chạy lại `prisma migrate dev`.

- [ ] **Step 9: Chạy test tổng → XANH**

Run: `npm run test`
Expected: PASS (money + prisma + permissions).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add better-auth with RBAC (owner/staff) + prisma auth models"
```

---

### Task 4: Design tokens + layout gốc (shadcn/ui + Be Vietnam Pro)

**Files:**
- Create (shadcn init): `components.json`, `src/lib/utils.ts`
- Modify: `src/app/globals.css` (design tokens)
- Modify: `src/app/layout.tsx` (font + header/footer)
- Create: `src/components/site-header.tsx`
- Create: `src/components/site-footer.tsx`
- Test: `src/components/site-header.test.tsx`

**Interfaces:**
- Produces: `<SiteHeader />`, `<SiteFooter />` React components.

- [ ] **Step 1: Khởi tạo shadcn/ui**

Run: `npx shadcn@latest init`
Chọn base color Neutral (ta sẽ override bằng tokens leafshoes). Tạo `components.json`, `src/lib/utils.ts` (hàm `cn`).

- [ ] **Step 2: Thêm design tokens vào `src/app/globals.css`**

Thêm biến màu thương hiệu (đặt trong `:root`, dùng cho Tailwind v4 qua `@theme inline` nếu cần):
```css
:root {
  --paper: #FAFAF7;
  --ink: #171717;
  --evergreen: #1B4332;
  --sage: #DCE7DF;
  --line: #E7E5E0;
  --accent: #2D6A4F;
}

body {
  background: var(--paper);
  color: var(--ink);
}
```

- [ ] **Step 3: Cấu hình font tiếng Việt trong `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const beVietnam = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "leafshoes Việt Nam",
  description: "Giày chính hãng — leafshoes Việt Nam",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={beVietnam.variable}>
      <body className="min-h-screen flex flex-col font-sans antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Viết test đỏ cho SiteHeader**

Create `src/components/site-header.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  it("hiển thị tên thương hiệu leafshoes", () => {
    render(<SiteHeader />);
    expect(screen.getByText(/leafshoes/i)).toBeInTheDocument();
  });

  it("có liên kết tới giỏ hàng", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: /giỏ hàng/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Chạy test → ĐỎ**

Run: `npm run test`
Expected: FAIL — không import được `./site-header`.

- [ ] **Step 6: Tạo `src/components/site-header.tsx` và `site-footer.tsx`**

`src/components/site-header.tsx`:
```tsx
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b" style={{ borderColor: "var(--line)" }}>
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-16">
        <Link href="/" className="text-lg font-extrabold tracking-tight" style={{ color: "var(--evergreen)" }}>
          leafshoes
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link href="/products">Sản phẩm</Link>
          <Link href="/cart" aria-label="Giỏ hàng">Giỏ hàng</Link>
        </nav>
      </div>
    </header>
  );
}
```

`src/components/site-footer.tsx`:
```tsx
export function SiteFooter() {
  return (
    <footer className="border-t mt-16" style={{ borderColor: "var(--line)" }}>
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-neutral-600">
        © 2026 leafshoes Việt Nam
      </div>
    </footer>
  );
}
```

- [ ] **Step 7: Chạy test → XANH**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 8: Kiểm tra build & chạy dev**

Run: `npm run build`
Expected: build thành công (không lỗi type).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add design tokens, Be Vietnam Pro font, base header/footer"
```

---

### Task 5: Playwright smoke E2E trang chủ

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/home.spec.ts`
- Modify: `package.json` (script `test:e2e`)
- Create/Modify: `src/app/page.tsx` (trang chủ tối giản có tiêu đề)

**Interfaces:**
- Consumes: layout + header từ Task 4.

- [ ] **Step 1: Cài Playwright**

Run:
```bash
npm i -D @playwright/test
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Tạo `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 3: Thêm script `test:e2e`**

Trong `package.json` `"scripts"`:
```json
"test:e2e": "playwright test"
```

- [ ] **Step 4: Đặt trang chủ tối giản `src/app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <h1 className="text-4xl font-extrabold tracking-tight" style={{ color: "var(--evergreen)" }}>
        Bước êm cùng leafshoes
      </h1>
      <p className="mt-4 text-neutral-600">Giày chính hãng, giao nhanh toàn quốc.</p>
    </section>
  );
}
```

- [ ] **Step 5: Viết test E2E**

Create `e2e/home.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("trang chủ hiển thị brand và điều hướng", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "leafshoes" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("leafshoes");
  await expect(page.getByRole("link", { name: /giỏ hàng/i })).toBeVisible();
});
```

- [ ] **Step 6: Chạy E2E → XANH**

Run: `npm run test:e2e`
Expected: 1 test PASS (Playwright tự build + start server).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: add playwright smoke e2e for home page"
```

---

## Cổng test cuối Ngày 1 (phải xanh mới sang Ngày 2)

- [ ] `npm run test` → tất cả unit test xanh (money, prisma, permissions, site-header).
- [ ] `npm run build` → build thành công.
- [ ] `pg_isready` → Postgres local chạy; `npx prisma migrate status` → up to date.
- [ ] `npm run test:e2e` → smoke trang chủ pass.

## Self-review (đã rà)

- **Spec coverage (phần Ngày 1 của [../06-plan-10-days.md](../06-plan-10-days.md)):** scaffold ✔ (T1), Tailwind+shadcn ✔ (T4), Postgres+Prisma ✔ (T2), Better Auth+RBAC ✔ (T3), design tokens+font VN ✔ (T4), test harness Vitest ✔ (T1) + Playwright ✔ (T5).
- **Placeholder scan:** không có TODO/mơ hồ; mọi step có code/lệnh cụ thể.
- **Type consistency:** `formatVnd`, `prisma`, `ac/owner/staff/roles`, `auth`, `SiteHeader/SiteFooter` dùng nhất quán giữa các task.
- **Rủi ro đã chú thích:** import adapter Better Auth có thể đổi → theo output CLI; ghi đè khi scaffold vào thư mục có `docs/`.
