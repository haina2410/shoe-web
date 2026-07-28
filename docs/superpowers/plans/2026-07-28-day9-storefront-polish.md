# Day 9 Storefront Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the leafshoes storefront and lightweight admin shell into a responsive, accessible ecommerce demo with a static product banner, curated category paths, trustworthy business contact information, valid temporary imagery, and robust empty/error states.

**Architecture:** Keep the existing App Router data flow and business logic unchanged. Add small presentation units around shared storefront content, a server-rendered shell with a narrow client cart island, and static temporary brand/product assets under `public/`; reuse current catalog/cart/order queries and actions rather than adding APIs or schema. Polish routes incrementally behind component tests, then verify the complete mobile/desktop experience with Playwright and visual inspection.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript strict, Tailwind CSS 4, Base UI/shadcn, Lucide React, Zustand, Prisma 7/Postgres, Vitest/Testing Library, Playwright, ImageGen.

## Global Constraints

- Read the relevant installed Next.js 16 guide in `node_modules/next/dist/docs/` before changing any Next.js API, convention, image, link, Server/Client boundary, metadata, or CSS behavior.
- Follow RED → GREEN → REFACTOR. Read `/Users/nam/.agents/skills/test-driven-development/writing-good-tests.md` before writing or changing tests.
- Preserve all Day 1–8 business behavior: checkout, VietQR, webhook, payment/refund ledger, order transitions, RBAC, inventory, jobs, email, and canonical order code `LEAFXXXXXX`.
- Do not add a promotion/discount model, crossed-out prices, percentages, countdowns, reviews, testimonials, sales claims, carousel, newsletter, analytics, customer accounts, or shipping-provider integration.
- Keep the chosen homepage order: navbar → static banner → three categories → featured products → trust strip → business footer.
- Keep the homepage `h1` text containing `Bước êm cùng leafshoes` and the featured section heading `Sản phẩm nổi bật` so existing E2E contracts remain meaningful.
- Use the approved company copy exactly: `CÔNG TY TNHH LEAFSHOES VIỆT NAM`, `Sản xuất giày dép, phụ liệu dép`, `0395.069.089`, `leafshoes.vn@gmail.com`, `Số 14, Đường Phú Sơn 3, Xã Bình Minh, TP. Đồng Nai`.
- Do not show `Sophie Dinh` or `Manager director` in the public footer.
- Temporary generated imagery must contain no embedded text, price, discount, claim, watermark, or third-party logo.
- Store temporary brand assets under `public/brand/` and temporary seeded product assets under `public/products/`; later replacement must not require a migration.
- Use the existing paper/ink/evergreen/sage/line tokens and Be Vietnam Pro; no loud gradient, heavy shadow, autoplay, or decorative motion.
- Respect `prefers-reduced-motion`; decorative SVG/motifs must be hidden from assistive technology.
- Public storefront receives deep polish. Admin receives consistent navigation, spacing, responsive tables/forms, badges, and empty states only—no charts or new operational modules.
- No direct DB mutations in E2E; exercise user-visible application behavior.
- Do not log PII, contact form values, bank details, generated image prompts containing secrets, or raw payment payloads.
- Known nonblocking baseline: the upload route may emit the existing Next.js NFT tracing warning, and a linked `.worktrees/` checkout may emit the existing multiple-lockfile workspace-root warning. Do not introduce new warnings.

---

## File and Responsibility Map

### Shared presentation foundation

- `src/lib/storefront-content.ts` — one source of truth for approved company, category, trust, and temporary asset copy.
- `src/components/brand-mark.tsx` — shared accessible temporary leaf mark + wordmark.
- `src/components/empty-state.tsx` — reusable action-oriented empty state with decorative leaf motif.
- `src/app/globals.css` — focus, reduced-motion, surface, and typography primitives only.
- `src/app/layout.tsx` — skip link and stable main landmark.
- `src/app/not-found.tsx`, `src/app/error.tsx` — safe actionable route-level
  missing/error states without leaking exception details.

### Store shell

- `src/components/storefront-search.tsx` — GET search form to `/products`.
- `src/components/cart-summary-link.tsx` — narrow client island for hydrated cart count.
- `src/components/site-header.tsx` — responsive sticky public navigation.
- `src/components/site-footer.tsx` — approved company/contact/footer navigation.

### Assets and homepage

- `src/lib/storefront-assets.ts` — stable public paths for temporary hero and six seed product images.
- `public/brand/leafshoes-mark.svg` — temporary vector leaf mark.
- `public/brand/hero-shoe-temporary.png` — generated static hero image.
- `public/products/*.png` — six generated temporary seed product images.
- `src/components/home/hero-banner.tsx` — static hero copy/image/CTA.
- `src/components/home/category-paths.tsx` — three curated category links.
- `src/components/home/trust-strip.tsx` — three truthful purchasing assurances.
- `src/app/page.tsx` — composes the chosen curated homepage.

### Route polish

- `src/components/product-card.tsx` — consistent product image, stock badge, typography, focus and reduced motion.
- `src/components/filters.tsx` — responsive filter surface and clear-all action.
- `src/app/products/page.tsx` — catalog hierarchy and actionable no-results state.
- `src/app/products/[slug]/page.tsx` — breadcrumb, gallery, purchase hierarchy and trust details.
- `src/app/cart/page.tsx`, `src/app/checkout/page.tsx`, `src/app/orders/[orderCode]/page.tsx`, `src/app/login/page.tsx` — purchase-flow layout, state and accessibility polish.
- `src/components/admin/admin-nav.tsx`, `src/app/admin/layout.tsx` — lightweight admin shell.
- Existing admin pages/components — targeted responsive surface/badge/empty-state polish without business changes.

### Verification and docs

- `e2e/day9-polish.spec.ts` — mobile/desktop, keyboard, empty-state and reduced-motion coverage.
- `README.md`, `docs/06-plan-10-days.md` — Day 9 handoff and status.

---

### Task 1: Storefront Content, Brand and Accessibility Foundation

**Files:**
- Create: `src/lib/storefront-content.ts`
- Create: `src/components/brand-mark.tsx`
- Create: `src/components/brand-mark.test.tsx`
- Create: `src/components/empty-state.tsx`
- Create: `src/components/empty-state.test.tsx`
- Create: `public/brand/leafshoes-mark.svg`
- Create: `src/app/not-found.tsx`
- Create: `src/app/not-found.test.tsx`
- Create: `src/app/error.tsx`
- Create: `src/app/error.test.tsx`
- Create: `src/app/layout.test.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `STORE_INFO`, `CATEGORY_PATHS`, `TRUST_ITEMS`, `BrandMark`, and `EmptyState`.
- `BrandMark` signature: `BrandMark({ compact?: boolean; className?: string }): React.JSX.Element`.
- `EmptyState` signature: `EmptyState({ title, description, action?: { href: string; label: string } }): React.JSX.Element`.
- Later tasks must import content instead of duplicating company/category/trust strings.

- [ ] **Step 1: Read the installed Next.js guides**

Read completely:

```text
node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
node_modules/next/dist/docs/01-app/01-getting-started/11-css.md
node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md
node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md
node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md
node_modules/next/dist/docs/03-architecture/accessibility.md
```

Record the relevant guidance in the task report.

- [ ] **Step 2: Write failing brand and empty-state tests**

Create tests that require the approved accessible contract:

```tsx
// src/components/brand-mark.test.tsx
render(<BrandMark />);
expect(screen.getByText("leafshoes")).toBeInTheDocument();
expect(screen.getByTestId("leaf-mark")).toHaveAttribute("aria-hidden", "true");

// src/components/empty-state.test.tsx
render(
  <EmptyState
    title="Giỏ hàng trống"
    description="Chọn một đôi giày để bắt đầu."
    action={{ href: "/products", label: "Xem sản phẩm" }}
  />,
);
expect(screen.getByRole("heading", { name: "Giỏ hàng trống" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Xem sản phẩm" })).toHaveAttribute(
  "href",
  "/products",
);
expect(screen.getByTestId("empty-state-leaf")).toHaveAttribute(
  "aria-hidden",
  "true",
);
```

Name the production changes that make these tests pass: exported
`BrandMark`/`EmptyState` components with real semantic output.

- [ ] **Step 3: Write failing root-layout and route-state tests**

Mock `next/font/google`, header, footer and hydrator, then render
`RootLayout({ children: <h1>Nội dung</h1> })`:

```tsx
expect(screen.getByRole("link", { name: "Bỏ qua điều hướng" })).toHaveAttribute(
  "href",
  "#main-content",
);
expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
```

Test the global not-found state:

```tsx
render(<NotFoundPage />);
expect(
  screen.getByRole("heading", { name: "Không tìm thấy trang" }),
).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute(
  "href",
  "/",
);
```

Test the client error boundary with a thrown message containing fake PII:

```tsx
const reset = vi.fn();
render(
  <GlobalError
    error={new Error("customer@example.com 0395000000")}
    reset={reset}
  />,
);
expect(
  screen.getByRole("heading", { name: "Có lỗi xảy ra" }),
).toBeInTheDocument();
expect(screen.queryByText(/customer@example.com|0395000000/)).not.toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "Thử lại" }));
expect(reset).toHaveBeenCalledTimes(1);
```

- [ ] **Step 4: Run RED**

Run:

```bash
npm run test -- src/components/brand-mark.test.tsx src/components/empty-state.test.tsx src/app/layout.test.tsx src/app/not-found.test.tsx src/app/error.test.tsx
```

Expected: FAIL because the two components do not exist and the layout has no
skip link/stable main id, not-found page, or safe retry boundary.

- [ ] **Step 5: Implement the immutable content contract**

Create:

```ts
export const STORE_INFO = {
  brand: "leafshoes",
  legalName: "CÔNG TY TNHH LEAFSHOES VIỆT NAM",
  businessLine: "Sản xuất giày dép, phụ liệu dép",
  phoneDisplay: "0395.069.089",
  phoneDigits: "0395069089",
  email: "leafshoes.vn@gmail.com",
  address: "Số 14, Đường Phú Sơn 3, Xã Bình Minh, TP. Đồng Nai",
  zaloUrl: "https://zalo.me/0395069089",
} as const;

export const CATEGORY_PATHS = [
  { label: "Sneaker", href: "/products?categorySlug=giay-sneaker" },
  { label: "Chạy bộ", href: "/products?categorySlug=giay-chay-bo" },
  { label: "Sandal", href: "/products?categorySlug=giay-sandal" },
] as const;

export const TRUST_ITEMS = [
  { title: "Thanh toán VietQR", description: "Chuyển khoản đúng mã đơn." },
  { title: "Giao hàng toàn quốc", description: "Phí giao hàng hiển thị rõ." },
  { title: "Hỗ trợ qua Zalo", description: "Liên hệ trực tiếp với cửa hàng." },
] as const;
```

Create `public/brand/leafshoes-mark.svg` as a simple evergreen leaf path with
`viewBox`, no text and no external reference. Implement `BrandMark` with
`next/image` referencing that SVG with `unoptimized`, empty `alt`, `aria-hidden="true"`,
`data-testid="leaf-mark"`, and visible wordmark. Implement `EmptyState` as a
semantic `<section>` with an `h2`, body copy, optional `Link`, and decorative
inline leaf SVG.

Create `not-found.tsx` using `EmptyState` with `Không tìm thấy trang` and a
`Về trang chủ` link. Create `error.tsx` with `"use client"`, generic safe copy
and a `Thử lại` button that calls `reset()`; never render or log the supplied
`error.message`.

- [ ] **Step 6: Add skip-link, focus and reduced-motion primitives**

Modify `layout.tsx`:

```tsx
<body className="min-h-screen flex flex-col font-sans antialiased">
  <a className="skip-link" href="#main-content">
    Bỏ qua điều hướng
  </a>
  <CartHydrator />
  <SiteHeader />
  <main id="main-content" className="flex-1" tabIndex={-1}>
    {children}
  </main>
  <SiteFooter />
</body>
```

Add CSS with exact intent:

```css
:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent) 75%, white);
  outline-offset: 3px;
}

.skip-link {
  position: fixed;
  left: 1rem;
  top: 1rem;
  z-index: 100;
  transform: translateY(-200%);
}

.skip-link:focus {
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Do not introduce dark-mode redesign in this task.

- [ ] **Step 7: Run GREEN and regression**

Run:

```bash
npm run test -- src/components/brand-mark.test.tsx src/components/empty-state.test.tsx src/app/layout.test.tsx src/app/not-found.test.tsx src/app/error.test.tsx src/components/site-header.test.tsx
npm run lint
```

Expected: all selected tests and lint PASS with no new warnings.

- [ ] **Step 8: Commit**

```bash
git add src/lib/storefront-content.ts src/components/brand-mark.tsx src/components/brand-mark.test.tsx src/components/empty-state.tsx src/components/empty-state.test.tsx public/brand/leafshoes-mark.svg src/app/layout.tsx src/app/layout.test.tsx src/app/not-found.tsx src/app/not-found.test.tsx src/app/error.tsx src/app/error.test.tsx src/app/globals.css
git commit -m "feat(ui): add storefront brand foundation"
```

---

### Task 2: Responsive Header, Search, Cart Count and Business Footer

**Files:**
- Create: `src/components/storefront-search.tsx`
- Create: `src/components/storefront-search.test.tsx`
- Create: `src/components/cart-summary-link.tsx`
- Create: `src/components/cart-summary-link.test.tsx`
- Create: `src/components/site-footer.test.tsx`
- Modify: `src/components/site-header.tsx`
- Modify: `src/components/site-header.test.tsx`
- Modify: `src/components/site-footer.tsx`

**Interfaces:**
- Consumes: `BrandMark` and `STORE_INFO` from Task 1.
- Produces: `StorefrontSearch`, `CartSummaryLink`, responsive `SiteHeader`, and complete `SiteFooter`.
- `StorefrontSearch` is a server-safe GET form; `CartSummaryLink` is the only new client island.

- [ ] **Step 1: Read the installed Link and Server/Client guides**

Read:

```text
node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md
node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
```

- [ ] **Step 2: Write failing header/search/cart tests**

Extend the header test and add focused child tests:

```tsx
expect(screen.getByRole("banner")).toBeInTheDocument();
expect(screen.getByRole("navigation", { name: "Điều hướng chính" })).toBeInTheDocument();
expect(screen.getByRole("searchbox", { name: "Tìm sản phẩm" })).toHaveAttribute(
  "name",
  "q",
);
expect(screen.getByRole("search")).toHaveAttribute("action", "/products");
```

Mock the Zustand selector for `CartSummaryLink`:

```tsx
mockState = { hasHydrated: false, items: [{ quantity: 3 }] };
render(<CartSummaryLink />);
expect(screen.getByRole("link", { name: "Giỏ hàng" })).toHaveTextContent(
  "Giỏ hàng",
);
expect(screen.queryByText("3")).not.toBeInTheDocument();

mockState = { hasHydrated: true, items: [{ quantity: 2 }, { quantity: 3 }] };
render(<CartSummaryLink />);
expect(screen.getByRole("link", { name: "Giỏ hàng, 5 sản phẩm" })).toHaveTextContent(
  "5",
);
```

The pre-hydration output must remain stable and must not expose a false zero.

- [ ] **Step 3: Write failing footer tests**

```tsx
render(<SiteFooter />);
expect(screen.getByRole("contentinfo")).toBeInTheDocument();
expect(screen.getByText(STORE_INFO.legalName)).toBeInTheDocument();
expect(screen.getByText(STORE_INFO.businessLine)).toBeInTheDocument();
expect(screen.getByRole("link", { name: STORE_INFO.phoneDisplay })).toHaveAttribute(
  "href",
  "tel:0395069089",
);
expect(screen.getByRole("link", { name: STORE_INFO.email })).toHaveAttribute(
  "href",
  "mailto:leafshoes.vn@gmail.com",
);
expect(screen.queryByText(/Sophie Dinh|Manager director/i)).not.toBeInTheDocument();
```

- [ ] **Step 4: Run RED**

Run:

```bash
npm run test -- src/components/site-header.test.tsx src/components/storefront-search.test.tsx src/components/cart-summary-link.test.tsx src/components/site-footer.test.tsx
```

Expected: FAIL because search/cart/footer contracts are absent.

- [ ] **Step 5: Implement search and hydrated cart count**

Implement search:

```tsx
export function StorefrontSearch() {
  return (
    <form action="/products" aria-label="Tìm sản phẩm" role="search">
      <label className="sr-only" htmlFor="storefront-search">Tìm sản phẩm</label>
      <input id="storefront-search" name="q" type="search" placeholder="Tìm giày…" />
      <button type="submit" aria-label="Gửi tìm kiếm">
        <Search aria-hidden="true" />
      </button>
    </form>
  );
}
```

Implement `CartSummaryLink` with `"use client"`, `useCartHydrated()`, and:

```ts
const count = useCart((state) =>
  state.items.reduce((sum, item) => sum + item.quantity, 0),
);
```

Before hydration, render only `Giỏ hàng`; after hydration, expose count in
visible text and accessible name when count is positive.

- [ ] **Step 6: Compose the responsive header**

Keep `SiteHeader` server-rendered. Use `BrandMark`, `StorefrontSearch`,
`CartSummaryLink`, and links to `/products`. Make it sticky with
`top-0 z-40`, paper backdrop, hairline border, a compact mobile grid, and a
desktop row. Do not add a JavaScript hamburger menu; two destinations plus
search fit a responsive shell without extra state.

- [ ] **Step 7: Implement the business footer**

Use `STORE_INFO` and `BrandMark`; render company, business line, contact,
address, navigation, Zalo, and current copyright. External Zalo link must use:

```tsx
target="_blank"
rel="noreferrer"
```

Do not include personal name/title or invented policy links.

- [ ] **Step 8: Run GREEN, header regression and lint**

Run:

```bash
npm run test -- src/components/site-header.test.tsx src/components/storefront-search.test.tsx src/components/cart-summary-link.test.tsx src/components/site-footer.test.tsx src/lib/cart.test.ts
npm run lint
```

Expected: PASS; no hydration-contract regression.

- [ ] **Step 9: Commit**

```bash
git add src/components/storefront-search.tsx src/components/storefront-search.test.tsx src/components/cart-summary-link.tsx src/components/cart-summary-link.test.tsx src/components/site-header.tsx src/components/site-header.test.tsx src/components/site-footer.tsx src/components/site-footer.test.tsx
git commit -m "feat(ui): polish storefront header and footer"
```

---

### Task 3: Temporary Hero and Seed Product Assets

**Files:**
- Create: `src/lib/storefront-assets.ts`
- Create: `src/lib/storefront-assets.test.ts`
- Create: `public/brand/hero-shoe-temporary.png`
- Create: `public/products/sneaker-la-xanh-co-thap-1.png`
- Create: `public/products/sneaker-do-thi-nang-dong-1.png`
- Create: `public/products/giay-chay-bo-em-nhe-1.png`
- Create: `public/products/giay-chay-bo-dia-hinh-1.png`
- Create: `public/products/sandal-quai-ngang-mua-he-1.png`
- Create: `public/products/sandal-di-bien-chong-truot-1.png`
- Modify: `prisma/seed.ts`
- Modify: `prisma/seed.test.ts`

**Interfaces:**
- Produces: `HERO_IMAGE_PATH` and `SEEDED_PRODUCT_IMAGE_BY_SLUG`.
- Consumed by Task 4 homepage and by Prisma seed.
- Asset paths are stable replacement seams; no DB migration.

- [ ] **Step 1: Read the ImageGen skill and Next Image guide**

Read completely:

```text
/Users/nam/.codex/skills/.system/imagegen/SKILL.md
node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md
```

Use ImageGen for all bitmap generation. Do not manufacture raster assets with
Python, canvas, SVG filters, or downloaded third-party product photography.

- [ ] **Step 2: Write the failing asset integrity tests**

Create constants expected by the seed:

```ts
export const HERO_IMAGE_PATH = "/brand/hero-shoe-temporary.png";

export const SEEDED_PRODUCT_IMAGE_BY_SLUG = {
  "sneaker-la-xanh-co-thap": "/products/sneaker-la-xanh-co-thap-1.png",
  "sneaker-do-thi-nang-dong": "/products/sneaker-do-thi-nang-dong-1.png",
  "giay-chay-bo-em-nhe": "/products/giay-chay-bo-em-nhe-1.png",
  "giay-chay-bo-dia-hinh": "/products/giay-chay-bo-dia-hinh-1.png",
  "sandal-quai-ngang-mua-he": "/products/sandal-quai-ngang-mua-he-1.png",
  "sandal-di-bien-chong-truot": "/products/sandal-di-bien-chong-truot-1.png",
} as const;
```

In the test, resolve each public URL safely:

```ts
const toPublicFile = (publicUrl: string) =>
  path.join(process.cwd(), "public", publicUrl.replace(/^\//, ""));

expect(existsSync(toPublicFile(HERO_IMAGE_PATH))).toBe(true);
for (const imageUrl of Object.values(SEEDED_PRODUCT_IMAGE_BY_SLUG)) {
  expect(existsSync(toPublicFile(imageUrl))).toBe(true);
}
```

Also assert keys equal the six known seed slugs. This test fails because files
and constants do not yet exist; it must not read the development DB.

- [ ] **Step 3: Run RED**

Run:

```bash
npm run test -- src/lib/storefront-assets.test.ts prisma/seed.test.ts
```

Expected: FAIL because asset constants/files are missing.

- [ ] **Step 4: Generate the temporary hero image**

Use ImageGen with this exact design intent:

```text
Create a wide 16:9 ecommerce hero photograph for a small Vietnamese shoe
brand. One contemporary unbranded sneaker on a clean warm-white studio
surface, subtle evergreen and sage botanical shadows, generous negative space
on the left for HTML copy, premium but approachable natural lighting,
product-forward minimal retail art direction. No text, letters, prices,
discounts, watermarks, people, third-party logos, gradients, or collage.
```

Save the output as `public/brand/hero-shoe-temporary.png`. Inspect it with
`view_image`; reject outputs with embedded marks/text or poor shoe anatomy.

- [ ] **Step 5: Generate six temporary seed packshots**

Generate one square image per seed product. Keep a coherent studio background
but make silhouettes/colors visibly distinct:

```text
Square ecommerce product packshot of an unbranded [PRODUCT DESCRIPTION],
three-quarter view, warm-white seamless studio background, subtle sage
botanical shadow, crisp realistic materials, centered with breathing room,
minimal Vietnamese retail art direction. No text, watermark, logo, person,
price, discount, collage, or extra shoes.
```

Use descriptions:

1. low-top green-accent canvas sneaker;
2. neutral urban everyday sneaker;
3. lightweight road running shoe;
4. rugged trail running shoe;
5. simple summer slide sandal;
6. water-friendly anti-slip beach sandal.

Save to the six exact `.png` paths above. Inspect every output.

- [ ] **Step 6: Wire seed paths**

Replace string literals in `prisma/seed.ts` with:

```ts
images: [SEEDED_PRODUCT_IMAGE_BY_SLUG["sneaker-la-xanh-co-thap"]],
```

for each product. Update seed tests to assert the same exported mapping instead
of duplicating URLs.

- [ ] **Step 7: Run GREEN, seed verification and asset inspection**

Run:

```bash
npm run test -- src/lib/storefront-assets.test.ts prisma/seed.test.ts
npm run db:seed
git diff --check
```

Expected: tests PASS, seed succeeds, every configured public asset exists.

- [ ] **Step 8: Commit**

```bash
git add src/lib/storefront-assets.ts src/lib/storefront-assets.test.ts prisma/seed.ts prisma/seed.test.ts public/brand public/products
git commit -m "feat(ui): add temporary storefront imagery"
```

---

### Task 4: Curated Homepage

**Files:**
- Create: `src/components/home/hero-banner.tsx`
- Create: `src/components/home/hero-banner.test.tsx`
- Create: `src/components/home/category-paths.tsx`
- Create: `src/components/home/category-paths.test.tsx`
- Create: `src/components/home/trust-strip.tsx`
- Create: `src/components/home/trust-strip.test.tsx`
- Create: `src/app/page.test.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `HERO_IMAGE_PATH`, `CATEGORY_PATHS`, `TRUST_ITEMS`, `EmptyState`, and existing `ProductCard`.
- Produces: chosen homepage order and stable headings/links for E2E.
- No new query/API/schema; continues `listProducts(prisma, {})` and `force-dynamic`.

- [ ] **Step 1: Read the installed Image and Link guides**

Read:

```text
node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md
node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md
```

- [ ] **Step 2: Write failing section tests**

Require exact behavior:

```tsx
render(<HeroBanner />);
expect(
  screen.getByRole("heading", { level: 1, name: /Bước êm cùng leafshoes/i }),
).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Khám phá sản phẩm" })).toHaveAttribute(
  "href",
  "/products",
);
expect(screen.getByRole("img", { name: /giày leafshoes/i })).toBeInTheDocument();

render(<CategoryPaths />);
for (const category of CATEGORY_PATHS) {
  expect(screen.getByRole("link", { name: category.label })).toHaveAttribute(
    "href",
    category.href,
  );
}

render(<TrustStrip />);
for (const item of TRUST_ITEMS) {
  expect(screen.getByText(item.title)).toBeInTheDocument();
}
```

In `page.test.tsx`, mock the query and child ProductCard, render the async page,
then assert DOM order:

```ts
const labels = screen.getAllByTestId("home-section").map((node) => node.dataset.section);
expect(labels).toEqual(["hero", "categories", "featured", "trust"]);
expect(screen.getByRole("heading", { name: "Sản phẩm nổi bật" })).toBeInTheDocument();
```

- [ ] **Step 3: Run RED**

Run:

```bash
npm run test -- src/components/home/hero-banner.test.tsx src/components/home/category-paths.test.tsx src/components/home/trust-strip.test.tsx src/app/page.test.tsx
```

Expected: FAIL because the new sections/order do not exist.

- [ ] **Step 4: Implement the static hero**

Use `next/image` with intrinsic dimensions matching the generated asset,
responsive `sizes`, meaningful alt, and `priority` because it is the LCP image.
The HTML copy—not the bitmap—contains:

```text
Bước êm cùng leafshoes
Thiết kế cho nhịp sống mỗi ngày.
Khám phá sản phẩm
```

Mobile stacks copy above image; desktop uses a balanced two-column banner.

- [ ] **Step 5: Implement category paths and trust strip**

Map immutable arrays from Task 1. Category tiles are real links; trust items
use decorative Lucide icons with `aria-hidden="true"`. Do not add category
images or unverifiable copy.

- [ ] **Step 6: Compose the homepage and actionable empty state**

Preserve dynamic data loading and compose:

```tsx
<HeroBanner />
<CategoryPaths />
<section data-testid="home-section" data-section="featured">
  <h2>Sản phẩm nổi bật</h2>
  {featured.length === 0 ? (
    <EmptyState
      title="Chưa có sản phẩm"
      description="Cửa hàng đang cập nhật sản phẩm mới."
      action={{ href: "/products", label: "Xem danh mục" }}
    />
  ) : (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {featured.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )}
</section>
<TrustStrip />
```

Keep the product mapping local; do not introduce a one-use `ProductGrid`
abstraction.

- [ ] **Step 7: Run GREEN and existing homepage E2E contract**

Run:

```bash
npm run test -- src/components/home/hero-banner.test.tsx src/components/home/category-paths.test.tsx src/components/home/trust-strip.test.tsx src/app/page.test.tsx src/components/product-card.test.tsx
SEPAY_WEBHOOK_SECRET=e2e-test-secret npx playwright test e2e/home.spec.ts e2e/storefront.spec.ts
```

Expected: component tests PASS; existing headings/navigation remain valid.

- [ ] **Step 8: Commit**

```bash
git add src/components/home src/app/page.tsx src/app/page.test.tsx
git commit -m "feat(ui): build curated storefront homepage"
```

---

### Task 5: Product Discovery and Detail Polish

**Files:**
- Modify: `src/components/product-card.tsx`
- Modify: `src/components/product-card.test.tsx`
- Modify: `src/components/filters.tsx`
- Modify: `src/components/filters.test.tsx`
- Modify: `src/app/products/page.tsx`
- Create: `src/app/products/page.test.tsx`
- Modify: `src/app/products/[slug]/page.tsx`
- Create: `src/app/products/[slug]/page.test.tsx`

**Interfaces:**
- Consumes: `EmptyState`, existing `CatalogListItem`, `VariantSelector`, and query-string filter contract.
- Produces: responsive catalog/filter states and polished detail hierarchy.
- Does not change `listProducts`, filter semantics, variant selection, cart payload, price, or stock behavior.

- [ ] **Step 1: Read the installed Image, Link, page and accessibility guides**

Read:

```text
node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md
node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md
node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md
node_modules/next/dist/docs/03-architecture/accessibility.md
```

- [ ] **Step 2: Write failing ProductCard tests**

Extend current tests:

```tsx
render(<ProductCard product={{ ...baseItem, totalStock: 0 }} />);
expect(screen.getByText("Hết hàng")).toBeInTheDocument();

render(<ProductCard product={{ ...baseItem, totalStock: 12 }} />);
expect(screen.queryByText("Hết hàng")).not.toBeInTheDocument();
expect(screen.queryByText(/giảm|%/i)).not.toBeInTheDocument();
```

Use `next/image` and mock it in tests to render an `<img>` while preserving
`src`/`alt`; test user-visible behavior, not generated optimizer URLs.

- [ ] **Step 3: Write failing filter/catalog empty-state tests**

Require:

```tsx
expect(screen.getByRole("complementary", { name: "Bộ lọc sản phẩm" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Xoá bộ lọc" })).toHaveAttribute(
  "href",
  "/products",
);
```

For an empty mocked catalog page:

```tsx
expect(screen.getByRole("heading", { name: "Không tìm thấy sản phẩm" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Xem tất cả sản phẩm" })).toHaveAttribute(
  "href",
  "/products",
);
```

- [ ] **Step 4: Write failing product-detail tests**

Mock `getProductBySlug` and assert:

```tsx
expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Sản phẩm" })).toHaveAttribute(
  "href",
  "/products",
);
expect(screen.getByText("Thanh toán VietQR")).toBeInTheDocument();
expect(screen.getByText("Hỗ trợ qua Zalo")).toBeInTheDocument();
expect(screen.getByRole("img", { name: product.name })).toBeInTheDocument();
```

Preserve assertions for size/color/stock through the existing
`VariantSelector` tests.

- [ ] **Step 5: Run RED**

Run:

```bash
npm run test -- src/components/product-card.test.tsx src/components/filters.test.tsx src/app/products/page.test.tsx 'src/app/products/[slug]/page.test.tsx' src/components/variant-selector.test.tsx
```

Expected: FAIL on missing badge, landmarks, clear action, empty-state and
detail trust/breadcrumb.

- [ ] **Step 6: Implement catalog/card polish**

- Keep one square image and one product link per card.
- Render product/card/detail gallery images with `next/image`, `fill` and
  responsive `sizes`. Use `unoptimized={imageUrl.startsWith("/api/uploads/")}`
  for locally served admin uploads; committed `/products/` assets use the
  optimizer normally.
- Add only a data-backed `Hết hàng` badge when `totalStock === 0`.
- Use transform only under `motion-safe:` and remove it under reduced motion.
- Add visible focus ring and price/name hierarchy.
- Give filters `aria-label="Bộ lọc sản phẩm"`, larger controls, a clear-all
  link, and mobile-friendly surface. Preserve every query parameter behavior.
- Replace the no-results dashed box with `EmptyState`.

- [ ] **Step 7: Implement product-detail hierarchy**

Add breadcrumb, more deliberate gallery spacing, product information card,
and a compact trust list. Keep all images tied to product gallery; do not add
variant-image behavior. Do not change `VariantSelector` inputs or cart item
snapshot.

- [ ] **Step 8: Run GREEN, query regression and storefront E2E**

Run:

```bash
npm run test -- src/components/product-card.test.tsx src/components/filters.test.tsx src/app/products/page.test.tsx 'src/app/products/[slug]/page.test.tsx' src/components/variant-selector.test.tsx src/server/queries/catalog.integration.test.ts
SEPAY_WEBHOOK_SECRET=e2e-test-secret npx playwright test e2e/storefront.spec.ts
```

Expected: all PASS; search without Vietnamese diacritics still works.

- [ ] **Step 9: Commit**

```bash
git add src/components/product-card.tsx src/components/product-card.test.tsx src/components/filters.tsx src/components/filters.test.tsx src/app/products
git commit -m "feat(ui): polish product discovery"
```

---

### Task 6: Cart, Checkout, Order and Login Polish

**Files:**
- Modify: `src/app/cart/page.tsx`
- Modify: `src/app/cart/page.test.tsx`
- Modify: `src/app/checkout/page.tsx`
- Modify: `src/app/checkout/page.test.tsx`
- Modify: `src/app/orders/[orderCode]/page.tsx`
- Modify: `src/app/orders/[orderCode]/page.test.tsx`
- Modify: `src/app/login/page.tsx`
- Create: `src/app/login/page.test.tsx`

**Interfaces:**
- Consumes: `EmptyState`, existing cart store/actions, checkout action, order query and VietQR helpers.
- Produces: responsive purchase-flow surfaces and semantic state messaging.
- Must not change checkout payload, clear-before-push order, QR content, order-status labels, bank config, totals, or PII handling.

- [ ] **Step 1: Read the relevant installed guides**

Read:

```text
node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
node_modules/next/dist/docs/03-architecture/accessibility.md
```

- [ ] **Step 2: Write failing cart and checkout state tests**

Extend current tests:

```tsx
expect(
  screen.getByRole("heading", { name: "Giỏ hàng trống" }),
).toBeInTheDocument();
expect(screen.getByText(/chọn một đôi giày/i)).toBeInTheDocument();

expect(screen.getByRole("status", { name: "Đang tải giỏ hàng" })).toBeInTheDocument();
```

For checkout action failure:

```tsx
await user.click(screen.getByRole("button", { name: "Đặt hàng" }));
expect(await screen.findByRole("alert")).toHaveTextContent(serverError);
expect(routerPush).not.toHaveBeenCalled();
expect(clear).not.toHaveBeenCalled();
```

Preserve existing tests for item controls, totals and successful redirect.

- [ ] **Step 3: Write failing order/login presentation tests**

Require order-state semantic labels:

```tsx
expect(screen.getByTestId("order-status")).toHaveAccessibleName(
  /trạng thái đơn hàng/i,
);
expect(screen.getByRole("region", { name: "Tóm tắt đơn hàng" })).toBeInTheDocument();
```

Require login presentation:

```tsx
render(<LoginPage />);
expect(screen.getByRole("heading", { name: "Đăng nhập quản trị" })).toBeInTheDocument();
expect(screen.getByText(/chỉ dành cho chủ cửa hàng và nhân viên/i)).toBeInTheDocument();
```

- [ ] **Step 4: Run RED**

Run:

```bash
npm run test -- src/app/cart/page.test.tsx src/app/checkout/page.test.tsx 'src/app/orders/[orderCode]/page.test.tsx' src/app/login/page.test.tsx
```

Expected: FAIL on new state semantics/copy/layout contracts.

- [ ] **Step 5: Implement cart and checkout polish**

- Use `EmptyState` for hydrated empty cart/checkout.
- Use stable `role="status"` hydration placeholders with visually restrained
  skeleton surfaces; do not announce repeated item details.
- On mobile, stack product content and controls without horizontal overflow.
- Preserve quantity input commit-on-blur semantics and accessible labels.
- Make checkout form sections/cards clear; error copy uses `role="alert"`.
- Keep the current `startTransition` logic, server-authoritative values and
  success flow untouched.

- [ ] **Step 6: Implement order and login polish**

- Turn order status into a clear badge with accessible label.
- Give payment and summary sections named regions.
- Keep transfer content prominent and copyable as text.
- Preserve QR `<img>` behavior and all bank data.
- Present login as a compact admin card with truthful restricted-access copy;
  do not add password reset or customer login.

- [ ] **Step 7: Run GREEN and purchase regressions**

Run:

```bash
npm run test -- src/app/cart/page.test.tsx src/app/checkout/page.test.tsx 'src/app/orders/[orderCode]/page.test.tsx' src/app/login/page.test.tsx src/lib/cart.test.ts src/server/actions/checkout.test.ts src/server/orders.integration.test.ts
SEPAY_WEBHOOK_SECRET=e2e-test-secret npx playwright test e2e/checkout.spec.ts
```

Expected: PASS; checkout → QR → signed webhook behavior remains intact.

- [ ] **Step 8: Commit**

```bash
git add src/app/cart/page.tsx src/app/cart/page.test.tsx src/app/checkout/page.tsx src/app/checkout/page.test.tsx 'src/app/orders/[orderCode]/page.tsx' 'src/app/orders/[orderCode]/page.test.tsx' src/app/login/page.tsx src/app/login/page.test.tsx
git commit -m "feat(ui): polish purchase flow states"
```

---

### Task 7: Lightweight Responsive Admin Shell

**Files:**
- Create: `src/components/admin/admin-nav.tsx`
- Create: `src/components/admin/admin-nav.test.tsx`
- Modify: `src/app/admin/layout.tsx`
- Create: `src/app/admin/layout.test.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/page.test.tsx`

**Interfaces:**
- Produces: `AdminNav` and a consistent shell consumed by all admin routes.
- Authorization remains in `requireAdmin()`; no new dashboard metrics,
  permissions, workflow or mutation.

- [ ] **Step 1: Read Server/Client and Link guides**

Read:

```text
node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md
```

- [ ] **Step 2: Write failing AdminNav/layout tests**

```tsx
render(<AdminNav />);
expect(screen.getByRole("navigation", { name: "Điều hướng quản trị" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "Sản phẩm" })).toHaveAttribute(
  "href",
  "/admin/products",
);
expect(screen.getByRole("link", { name: "Đơn hàng" })).toHaveAttribute(
  "href",
  "/admin/orders",
);
expect(screen.getByRole("link", { name: "Đối soát" })).toHaveAttribute(
  "href",
  "/admin/bank-transactions/review",
);
```

Mock `requireAdmin`, render layout, and assert navigation precedes child main
content. Do not test mocked authorization behavior here; existing auth tests
already own it.

- [ ] **Step 3: Write the failing dashboard copy test**

Add behavior-level assertions to `src/app/admin/page.test.tsx`:

```tsx
expect(screen.queryByText(/nội dung sẽ được bổ sung/i)).not.toBeInTheDocument();
expect(screen.getByRole("heading", { name: "Vận hành cửa hàng" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: /Quản lý sản phẩm/i })).toBeInTheDocument();
expect(screen.getByRole("link", { name: /Quản lý đơn hàng/i })).toBeInTheDocument();
```

- [ ] **Step 4: Run RED**

Run:

```bash
npm run test -- src/components/admin/admin-nav.test.tsx src/app/admin/layout.test.tsx src/app/admin/page.test.tsx
```

Expected: FAIL on missing navigation and stale dashboard copy.

- [ ] **Step 5: Implement the admin shell**

- Keep `AdminLayout` as an async Server Component that calls `requireAdmin()`
  before rendering anything.
- Add a compact horizontally scrollable `AdminNav`; do not add a client menu.
- Use a consistent page heading/description rhythm and surface treatment.
- Replace the stale dashboard heading/copy with `Vận hành cửa hàng` and a
  truthful description of the three existing destinations.

- [ ] **Step 6: Run GREEN and layout regressions**

Run:

```bash
npm run test -- src/components/admin/admin-nav.test.tsx src/app/admin/layout.test.tsx src/app/admin/page.test.tsx
npm run lint
```

Expected: selected tests and lint PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/admin-nav.tsx src/components/admin/admin-nav.test.tsx src/app/admin/layout.tsx src/app/admin/layout.test.tsx src/app/admin/page.tsx src/app/admin/page.test.tsx
git commit -m "feat(ui): add responsive admin shell"
```

---

### Task 8: Admin Operational Surface Polish

**Files:**
- Modify: `src/app/admin/products/page.tsx`
- Modify: `src/app/admin/orders/page.tsx`
- Modify: `src/app/admin/orders/page.test.tsx`
- Modify: `src/app/admin/orders/[id]/page.tsx`
- Modify: `src/app/admin/orders/[id]/page.test.tsx`
- Modify: `src/app/admin/bank-transactions/review/page.tsx`
- Modify: `src/app/admin/bank-transactions/review/page.test.tsx`
- Modify: `src/components/admin/product-form.tsx`
- Modify: `src/components/admin/stock-quick-edit.tsx`
- Modify: `src/components/admin/order-status-actions.tsx`
- Modify: `src/components/admin/refund-form.tsx`
- Modify: `src/components/admin/match-transaction-form.tsx`

**Interfaces:**
- Consumes the `AdminNav` shell from Task 7 and existing query/action
  contracts.
- Produces consistent responsive tables, forms, badges and empty states.
- Does not modify any query, action, core transaction, authorization rule,
  payment, order, refund, stock or product mutation behavior.

- [ ] **Step 1: Write failing representative surface tests**

Add behavior-level assertions:

```tsx
expect(screen.getByRole("form", { name: "Bộ lọc đơn hàng" })).toBeInTheDocument();
expect(screen.getByText("Hoàn tiền một phần")).toBeInTheDocument();
```

For empty review/orders pages, require an actionable `EmptyState` heading
instead of a bare paragraph:

```tsx
expect(
  screen.getByRole("heading", { name: "Không tìm thấy đơn hàng" }),
).toBeInTheDocument();
expect(
  screen.getByRole("heading", { name: "Không có giao dịch cần đối soát" }),
).toBeInTheDocument();
```

For table wrappers, assert descriptive region labels:

```tsx
expect(screen.getByRole("region", { name: "Danh sách đơn hàng" })).toBeInTheDocument();
```

Do not assert Tailwind class strings.

- [ ] **Step 2: Run RED**

Run:

```bash
npm run test -- src/app/admin/orders/page.test.tsx 'src/app/admin/orders/[id]/page.test.tsx' src/app/admin/bank-transactions/review/page.test.tsx src/components/admin/product-form.test.tsx src/components/admin/stock-quick-edit.test.tsx src/components/admin/order-status-actions.test.tsx src/components/admin/refund-form.test.tsx src/components/admin/match-transaction-form.test.tsx
```

Expected: FAIL on missing regions/actionable empty states and current
presentation contracts.

- [ ] **Step 3: Apply targeted responsive polish**

- Tables remain tables on desktop and keep `overflow-x-auto` with named
  regions on narrow screens; do not create a second mobile data renderer.
- Forms/actions stack on mobile and use existing buttons/inputs.
- Status/refund badges use semantic text and consistent tokens.
- Empty order/review states use `EmptyState`.
- Product form image/variant areas remain functionally identical.
- Preserve every existing form field, action input, pending state and safe
  error message.
- Do not touch query/action/core files.

- [ ] **Step 4: Run GREEN and all admin component/auth regressions**

Run:

```bash
npm run test -- src/components/admin src/app/admin
npm run test -- src/server/actions/products.authz.test.ts src/server/actions/payments.authz.test.ts src/server/actions/order-status.authz.test.ts src/server/actions/refunds.authz.test.ts src/server/actions/bank-transactions.authz.test.ts
npm run lint
```

Expected: all selected tests PASS; both owner/staff behavior stays unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin src/app/admin/products src/app/admin/orders src/app/admin/bank-transactions
git commit -m "feat(ui): polish admin operations"
```

---

### Task 9: Mobile/Desktop E2E, Visual QA and Documentation

**Files:**
- Create: `e2e/day9-polish.spec.ts`
- Modify: `e2e/home.spec.ts`
- Modify: `e2e/storefront.spec.ts`
- Modify: `README.md`
- Modify: `docs/06-plan-10-days.md`

**Interfaces:**
- Consumes the complete Day 9 UI.
- Produces mobile/desktop/reduced-motion/keyboard verification and final
  documentation.
- Existing E2E helpers and signed webhook flow remain unchanged.

- [ ] **Step 1: Write the failing Day 9 E2E**

Create two explicit viewports:

```ts
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`${viewport.name}: homepage dẫn tới danh mục và sản phẩm`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Bước êm cùng leafshoes/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sneaker" })).toBeVisible();
    await expect(page.getByText("Thanh toán VietQR")).toBeVisible();
    await expect(page.getByText("CÔNG TY TNHH LEAFSHOES VIỆT NAM")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}
```

Add keyboard search:

```ts
await page.goto("/");
await page.keyboard.press("Tab");
await expect(page.getByRole("link", { name: "Bỏ qua điều hướng" })).toBeFocused();
await page.getByRole("searchbox", { name: "Tìm sản phẩm" }).fill("chay bo");
await page.getByRole("button", { name: "Gửi tìm kiếm" }).click();
await expect(page).toHaveURL(/[?&]q=chay(\+|%20)bo/);
```

Add reduced motion:

```ts
await page.emulateMedia({ reducedMotion: "reduce" });
await page.goto("/");
const cardImage = page.locator('a[href^="/products/"] img').first();
await expect(cardImage).toHaveCSS("transition-duration", "0.01ms");
```

If the browser normalizes the duration to seconds, assert the computed value
returned by the installed browser (`0.00001s`) after observing RED once; do not
weaken the assertion to “not empty”.

- [ ] **Step 2: Run RED**

Run:

```bash
SEPAY_WEBHOOK_SECRET=e2e-test-secret npx playwright test e2e/day9-polish.spec.ts
```

Expected: FAIL before the final Day 9 composition/semantics are present.

- [ ] **Step 3: Update existing E2E wording without weakening flows**

Keep existing checkout/webhook/admin flows. Update selectors only where Day 9
approved copy/layout changed. `e2e/storefront.spec.ts` must still prove:

```text
homepage → catalog → search "chay bo" → accented product → product detail →
size/color selection → visible stock
```

Do not replace behavior assertions with screenshots.

- [ ] **Step 4: Run focused GREEN**

Run:

```bash
SEPAY_WEBHOOK_SECRET=e2e-test-secret npx playwright test e2e/home.spec.ts e2e/storefront.spec.ts e2e/day9-polish.spec.ts
```

Expected: all selected tests PASS on the production build.

- [ ] **Step 5: Perform visual QA**

Start the app with production-equivalent data and capture screenshots for:

```text
/
/products
/products/giay-chay-bo-em-nhe
/cart (empty and populated)
/checkout (populated)
/orders/<fresh-order-code>
/admin
/admin/orders
```

Inspect at `390×844` and `1440×1000` using the browser skill and/or Playwright
screenshots plus `view_image`. Fix only concrete Day 9 defects found:
overflow, clipping, unreadable contrast, broken image, ambiguous hierarchy or
missing focus. Every behavior fix gets a failing test first.

- [ ] **Step 6: Update documentation**

In `docs/06-plan-10-days.md`, mark Day 9 complete and list:

- curated static banner/category/product/trust/footer homepage;
- temporary replaceable assets;
- responsive storefront/admin polish;
- skip link, focus and reduced motion;
- mobile/desktop E2E and visual QA;
- no discount/carousel.

In `README.md`, add the public company contact/footer note and Day 9 UI
handoff. Do not duplicate the full post-Day-10 backlog; link
`docs/07-post-day10-storefront-backlog.md`.

- [ ] **Step 7: Run the complete final gate**

Run from a clean tree:

```bash
npx prisma generate
npx prisma migrate deploy
npm run lint
npm run test
npm run build
npm run db:seed
SEPAY_WEBHOOK_SECRET=e2e-test-secret npm run test:e2e
git diff --check
```

Expected:

- Prisma Client generation succeeds;
- seven existing migrations apply with none pending (Day 9 adds no migration);
- lint PASS with no new warnings;
- every Vitest file/test PASS;
- Next production build PASS;
- seed PASS and all seven temporary bitmap assets resolve;
- all Playwright tests PASS;
- `git diff --check` prints nothing.

The known upload-route NFT tracing warning may remain. Any other new warning is
a finding, not “noise”.

- [ ] **Step 8: Commit**

```bash
git add e2e/day9-polish.spec.ts e2e/home.spec.ts e2e/storefront.spec.ts README.md docs/06-plan-10-days.md
git commit -m "test: verify day 9 responsive storefront"
```

---

## Final Acceptance Checklist

- [ ] Navbar has the temporary logo, `/products` navigation, GET search and a hydration-safe cart count.
- [ ] Footer contains the exact approved company/contact/address copy and excludes personal name/title.
- [ ] Homepage order is banner → categories → featured products → trust strip; there is no carousel or discount UI.
- [ ] Banner and all six seed product image paths resolve to committed temporary assets without embedded text/logo/price/claim.
- [ ] Product cards only show data-backed stock state; no fabricated sale/review badge.
- [ ] Product detail keeps product-level imagery; Day 9 does not implement variant images.
- [ ] Storefront routes are usable at mobile and desktop widths with no horizontal page overflow.
- [ ] Admin navigation, tables, forms, badges and empty states are consistent without business/core changes.
- [ ] Skip link, semantic landmarks, focus-visible, touch targets and reduced motion are verified.
- [ ] Existing Day 1–8 E2E behavior remains intact, including the exact signed SePay webhook flow.
- [ ] Backlog remains in `docs/07-post-day10-storefront-backlog.md`; deferred features are not smuggled into Day 9.
- [ ] Full final gate is green on the exact commit under review.
