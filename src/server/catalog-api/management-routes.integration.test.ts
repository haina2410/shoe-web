import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import { testPrisma as db, resetDb } from "@/test/db";
import { createTestBoss, resetQueues } from "@/test/boss";
import { ensureQueues } from "@/jobs/queue";
import { issueCatalogToken, catalogScopes } from "./tokens";
import { markOrderPaidCore } from "@/server/payments/mark-order-paid";
vi.mock("@/lib/prisma", async () => ({
  prisma: (await import("@/test/db")).testPrisma,
}));
import { GET as list } from "@/app/api/admin/products/route";
import { DELETE as deleteProduct } from "@/app/api/admin/products/[id]/route";
import { POST as createCategory } from "@/app/api/admin/categories/route";
import {
  PATCH as updateCategory,
  DELETE as deleteCategory,
} from "@/app/api/admin/categories/[id]/route";
import {
  PATCH as updateVariant,
  DELETE as deleteVariant,
} from "@/app/api/admin/products/[id]/variants/[variantId]/route";

let secret: string;
let tokenId: string;
let categoryId: string;
let boss: PgBoss;
const bossGlobal = globalThis as unknown as { bossPromise?: Promise<PgBoss> };
beforeAll(async () => {
  boss = createTestBoss();
  await boss.start();
  await ensureQueues(boss);
  bossGlobal.bossPromise = Promise.resolve(boss);
});
afterAll(async () => {
  bossGlobal.bossPromise = undefined;
  await boss.stop();
});
beforeEach(async () => {
  await resetDb();
  await resetQueues(boss);
  const owner = await db.user.upsert({
    where: { email: "management@catalog-api.test" },
    create: {
      id: crypto.randomUUID(),
      name: "Owner",
      email: "management@catalog-api.test",
      role: "owner",
    },
    update: { role: "owner", banned: false },
  });
  const issued = await issueCatalogToken(db, {
    ownerId: owner.id,
    name: "management",
    scopes: [...catalogScopes],
    expiresAt: new Date(Date.now() + 3600000),
  });
  secret = issued.token;
  tokenId = issued.id;
  categoryId = (
    await db.category.create({ data: { name: "Shoes", slug: "shoes" } })
  ).id;
});
function req(path: string, method = "GET", body?: unknown, key = "management") {
  return new Request(`https://shop.test/api/admin/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "idempotency-key": key,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const ctx = (id: string, variantId = "missing") => ({
  params: Promise.resolve({ id, variantId }),
});
async function product(
  slug = "shoe",
  status: "DRAFT" | "ACTIVE" | "ARCHIVED" = "DRAFT",
) {
  return db.product.create({
    data: {
      name: "Giày Đen",
      nameNormalized: "giay den",
      slug,
      categoryId,
      basePrice: 100000,
      status,
      variants: {
        create: [
          {
            size: "38",
            color: "Black",
            sku: `${slug}-38`,
            stock: 5,
            priceOverride: 120000,
          },
          { size: "39", color: "White", sku: `${slug}-39`, stock: 3 },
        ],
      },
    },
    include: { variants: { orderBy: { size: "asc" } } },
  });
}
async function order(variantId: string) {
  return db.order.create({
    data: {
      orderCode: `LEAF-${crypto.randomUUID()}`,
      email: "buyer@test.local",
      customerName: "Buyer",
      phone: "0900000000",
      province: "Hanoi",
      ward: "Ward",
      addressLine: "1 Street",
      subtotal: 100000,
      shippingFee: 0,
      total: 100000,
      items: {
        create: {
          variantId,
          productName: "Original shoe",
          size: "38",
          color: "Black",
          unitPrice: 100000,
          quantity: 1,
        },
      },
    },
  });
}

it("lists all statuses with stable pagination and searches names, slugs and SKUs", async () => {
  const draft = await product("draft");
  await product("active", "ACTIVE");
  await product("archived", "ARCHIVED");
  const first = await list(req("products?limit=2"));
  expect(first.status).toBe(200);
  const page = await first.json();
  expect(page.data).toHaveLength(2);
  expect(page.nextCursor).toBe(page.data[1].id);
  const second = await (
    await list(req(`products?limit=2&cursor=${page.nextCursor}`))
  ).json();
  expect(second.data).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...page.data, ...second.data].map((p) => p.id)).size).toBe(3);
  for (const [query, count] of [
    ["q=giay", 3],
    ["q=DRAFT-38", 1],
    ["q=archived", 1],
    ["sku=draft-38", 1],
    ["sku=DRAFT-38", 0],
    ["status=ARCHIVED", 1],
    [`categoryId=${categoryId}`, 3],
    ["categoryId=missing", 0],
  ] as const) {
    const response = await list(req(`products?${query}`));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toHaveLength(count);
  }
  const found = await (await list(req("products?sku=draft-38"))).json();
  expect(found.data[0].id).toBe(draft.id);
  expect(found.data[0].variants).toHaveLength(2);
  for (const query of [
    "limit=0",
    "limit=101",
    "status=INVALID",
    "cursor=",
    "q=",
    "unknown=value",
  ]) {
    expect((await list(req(`products?${query}`))).status).toBe(422);
  }
});

it("updates variant metadata without replacing stock or order history", async () => {
  const item = await product();
  const variant = item.variants[0];
  const previousOrder = await order(variant.id);
  const body = { sku: "  NEW-SKU  ", size: " 40 ", priceOverride: null };
  const response = await updateVariant(
    req("products/id/variants/id", "PATCH", body),
    ctx(item.id, variant.id),
  );
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.data).toMatchObject({
    id: variant.id,
    productId: item.id,
    sku: "NEW-SKU",
    size: "40",
    color: "Black",
    stock: 5,
    priceOverride: null,
  });
  expect(result.replayed).toBe(false);
  expect(
    await db.orderItem.findFirstOrThrow({
      where: { orderId: previousOrder.id },
    }),
  ).toMatchObject({ variantId: variant.id, size: "38", color: "Black" });
  expect(
    (
      await db.product.findUniqueOrThrow({ where: { id: item.id } })
    ).updatedAt.getTime(),
  ).toBeGreaterThan(item.updatedAt.getTime());
});

it("guards absolute stock updates and stores an idempotent response snapshot", async () => {
  const item = await product();
  const variant = item.variants[0];
  const body = { stock: 8, expectedStock: 5 };
  const responses = await Promise.all(
    Array.from({ length: 3 }, () =>
      updateVariant(
        req("products/id/variants/id", "PATCH", body),
        ctx(item.id, variant.id),
      ),
    ),
  );
  expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
  const results = await Promise.all(responses.map((r) => r.json()));
  expect(results.filter((r) => !r.replayed)).toHaveLength(1);
  expect(results[0].data.stock).toBe(8);
  await db.variant.update({ where: { id: variant.id }, data: { stock: 7 } });
  const replay = await (
    await updateVariant(
      req("products/id/variants/id", "PATCH", body),
      ctx(item.id, variant.id),
    )
  ).json();
  expect(replay).toMatchObject({ replayed: true, data: { stock: 8 } });
  const stale = await updateVariant(
    req(
      "products/id/variants/id",
      "PATCH",
      { stock: 20, expectedStock: 8, sku: "MUST-NOT-CHANGE" },
      "stale",
    ),
    ctx(item.id, variant.id),
  );
  expect(stale.status).toBe(409);
  expect((await stale.json()).error.code).toBe("STALE_STOCK");
  expect(
    await db.variant.findUniqueOrThrow({ where: { id: variant.id } }),
  ).toMatchObject({ stock: 7, sku: "shoe-38" });
  expect(
    await db.catalogApiAudit.count({
      where: { tokenId, operation: "variants:update" },
    }),
  ).toBe(1);
  const conflict = await updateVariant(
    req("products/id/variants/id", "PATCH", body),
    ctx(item.id, item.variants[1].id),
  );
  expect((await conflict.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
});

it("permits only one writer for the same stock value across different tokens", async () => {
  const item = await product();
  const token = await db.catalogApiToken.findUniqueOrThrow({
    where: { id: tokenId },
  });
  const other = await issueCatalogToken(db, {
    ownerId: token.ownerId,
    name: "other",
    scopes: [...catalogScopes],
    expiresAt: new Date(Date.now() + 3600000),
  });
  const a = req(
    "products/id/variants/id",
    "PATCH",
    { stock: 6, expectedStock: 5 },
    "a",
  );
  const b = req(
    "products/id/variants/id",
    "PATCH",
    { stock: 7, expectedStock: 5 },
    "b",
  );
  b.headers.set("authorization", `Bearer ${other.token}`);
  const responses = await Promise.all([
    updateVariant(a, ctx(item.id, item.variants[0].id)),
    updateVariant(b, ctx(item.id, item.variants[0].id)),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
});

it("rejects invalid variant patches, conflicting identities and wrong parents", async () => {
  const item = await product();
  const variant = item.variants[0];
  for (const body of [
    {},
    { stock: 2 },
    { expectedStock: 5 },
    { sku: "" },
    { stock: -1, expectedStock: 5 },
    { priceOverride: 2147483648 },
    { productId: "injected" },
    { color: null },
    { stock: 1, expectedStock: "5" },
  ]) {
    expect(
      (
        await updateVariant(
          req("products/id/variants/id", "PATCH", body),
          ctx(item.id, variant.id),
        )
      ).status,
    ).toBe(422);
  }
  for (const body of [{ sku: "shoe-39" }, { size: "39", color: "White" }]) {
    expect(
      (
        await updateVariant(
          req("products/id/variants/id", "PATCH", body),
          ctx(item.id, variant.id),
        )
      ).status,
    ).toBe(409);
  }
  const other = await product("other");
  for (const context of [
    ctx(item.id, "missing"),
    ctx(other.id, variant.id),
    ctx("missing", variant.id),
  ]) {
    expect(
      (
        await updateVariant(
          req("products/id/variants/id", "PATCH", { size: "40" }),
          context,
        )
      ).status,
    ).toBe(404);
    expect(
      (await deleteVariant(req("products/id/variants/id", "DELETE"), context))
        .status,
    ).toBe(404);
  }
  expect(
    await db.variant.findUniqueOrThrow({ where: { id: variant.id } }),
  ).toEqual(variant);
});

it("deletes an unused variant once and prevents removing the final variant", async () => {
  const item = await product();
  const variant = item.variants[0];
  const responses = await Promise.all(
    Array.from({ length: 3 }, () =>
      deleteVariant(
        req("products/id/variants/id", "DELETE"),
        ctx(item.id, variant.id),
      ),
    ),
  );
  expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
  const results = await Promise.all(responses.map((r) => r.json()));
  expect(results.filter((r) => !r.replayed)).toHaveLength(1);
  expect(results[0].data).toEqual({
    id: variant.id,
    productId: item.id,
    deleted: true,
  });
  expect(await db.variant.findUnique({ where: { id: variant.id } })).toBeNull();
  const last = await deleteVariant(
    req("products/id/variants/id", "DELETE", undefined, "last"),
    ctx(item.id, item.variants[1].id),
  );
  expect(last.status).toBe(409);
  expect((await last.json()).error.code).toBe("LAST_VARIANT");
  expect(
    await db.catalogApiAudit.count({
      where: { tokenId, operation: "variants:delete" },
    }),
  ).toBe(1);
  expect(
    (
      await deleteVariant(
        req("products/id/variants/id", "DELETE"),
        ctx(item.id, item.variants[1].id),
      )
    ).status,
  ).toBe(409);
});

it("keeps products and variants referenced by any order and rolls back deletion", async () => {
  const item = await product();
  await order(item.variants[0].id);
  for (const [handler, context, code] of [
    [deleteVariant, ctx(item.id, item.variants[0].id), "VARIANT_IN_USE"],
    [deleteProduct, ctx(item.id), "PRODUCT_IN_USE"],
  ] as const) {
    const response = await handler(req("products/id", "DELETE"), context);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe(code);
  }
  expect(await db.variant.count()).toBe(2);
  expect(await db.product.count()).toBe(1);
  expect(await db.catalogApiAudit.count({ where: { tokenId } })).toBe(0);
});

it("deletes a product with its variants, replays after deletion and binds its key to the target", async () => {
  const item = await product();
  for (const replayed of [false, true]) {
    const response = await deleteProduct(
      req("products/id", "DELETE"),
      ctx(item.id),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      replayed,
      data: { id: item.id, deleted: true },
    });
  }
  expect(await db.product.count()).toBe(0);
  expect(await db.variant.count()).toBe(0);
  expect(
    (
      await deleteProduct(
        req("products/id", "DELETE", undefined, "missing"),
        ctx("missing"),
      )
    ).status,
  ).toBe(404);
  expect(
    (await deleteProduct(req("products/id", "DELETE"), ctx("other"))).status,
  ).toBe(409);
  expect(
    await db.catalogApiAudit.count({
      where: { tokenId, operation: "products:delete" },
    }),
  ).toBe(1);
});

it("creates flat categories with unique slugs and idempotent snapshots", async () => {
  const body = { name: "  Giày Chạy Bộ  " };
  const response = await createCategory(req("categories", "POST", body));
  expect(response.status).toBe(201);
  const first = await response.json();
  expect(first.data).toMatchObject({
    name: "Giày Chạy Bộ",
    slug: "giay-chay-bo",
    parentId: null,
  });
  const replay = await createCategory(req("categories", "POST", body));
  expect(replay.status).toBe(200);
  expect(await replay.json()).toMatchObject({
    replayed: true,
    data: first.data,
  });
  const duplicate = await (
    await createCategory(req("categories", "POST", body, "duplicate-name"))
  ).json();
  expect(duplicate.data.slug).toBe("giay-chay-bo-2");
  expect(
    (await createCategory(req("categories", "POST", { name: "Changed" })))
      .status,
  ).toBe(409);
  expect(
    await db.catalogApiAudit.count({
      where: { tokenId, operation: "categories:create" },
    }),
  ).toBe(2);
});

it("renames a category without changing its slug and deletes only empty categories", async () => {
  const item = await product();
  const response = await updateCategory(
    req("categories/id", "PATCH", { name: "  New Shoes  " }),
    ctx(categoryId),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).data).toMatchObject({
    id: categoryId,
    name: "New Shoes",
    slug: "shoes",
  });
  expect(
    (
      await updateCategory(
        req("categories/id", "PATCH", { name: "New Shoes" }),
        ctx(categoryId),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await updateCategory(
        req("categories/id", "PATCH", { name: "Other" }),
        ctx(categoryId),
      )
    ).status,
  ).toBe(409);
  const used = await deleteCategory(
    req("categories/id", "DELETE"),
    ctx(categoryId),
  );
  expect(used.status).toBe(409);
  expect((await used.json()).error.code).toBe("CATEGORY_IN_USE");
  await deleteProduct(req("products/id", "DELETE"), ctx(item.id));
  for (const replayed of [false, true]) {
    const deleted = await deleteCategory(
      req("categories/id", "DELETE"),
      ctx(categoryId),
    );
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({
      replayed,
      data: { id: categoryId, deleted: true },
    });
  }
  expect(await db.category.count()).toBe(0);
});

it("blocks deletion of categories with children and rejects unsupported category fields", async () => {
  await db.category.create({
    data: { name: "Child", slug: "child", parentId: categoryId },
  });
  const response = await deleteCategory(
    req("categories/id", "DELETE"),
    ctx(categoryId),
  );
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("CATEGORY_IN_USE");
  for (const body of [
    {},
    { name: " " },
    { name: "X".repeat(81) },
    { name: "Shoes", slug: "changed" },
    { name: "Child", parentId: categoryId },
  ]) {
    expect((await createCategory(req("categories", "POST", body))).status).toBe(
      422,
    );
    expect(
      (
        await updateCategory(
          req("categories/id", "PATCH", body),
          ctx(categoryId),
        )
      ).status,
    ).toBe(422);
  }
  expect(
    (
      await updateCategory(
        req("categories/id", "PATCH", { name: "Missing" }),
        ctx("missing"),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await deleteCategory(
        req("categories/id", "DELETE", undefined, "missing"),
        ctx("missing"),
      )
    ).status,
  ).toBe(404);
});

it("authenticates every new endpoint before parsing and requires separate mutation scopes and keys", async () => {
  const calls = [
    { handler: list, method: "GET", body: undefined },
    { handler: createCategory, method: "POST", body: { name: "New" } },
    { handler: updateCategory, method: "PATCH", body: { name: "New" } },
    { handler: deleteCategory, method: "DELETE", body: undefined },
    { handler: deleteProduct, method: "DELETE", body: undefined },
    { handler: updateVariant, method: "PATCH", body: { size: "40" } },
    { handler: deleteVariant, method: "DELETE", body: undefined },
  ];
  for (const { handler, method, body } of calls) {
    const request = req("products/id", method, body);
    request.headers.delete("authorization");
    const response = await handler(request, ctx("missing"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  const item = await product();
  for (const { handler, method, body } of calls.slice(1)) {
    const request = req("products/id", method, body);
    request.headers.delete("idempotency-key");
    expect(
      (await handler(request, ctx(item.id, item.variants[0].id))).status,
    ).toBe(400);
  }
  await db.catalogApiToken.update({
    where: { id: tokenId },
    data: {
      scopes: [
        "catalog:read",
        "products:create",
        "products:update",
        "images:write",
        "variants:create",
      ],
    },
  });
  expect((await list(req("products"))).status).toBe(200);
  for (const { handler, method, body } of calls.slice(1)) {
    expect(
      (
        await handler(
          req("products/id", method, body),
          ctx(item.id, item.variants[0].id),
        )
      ).status,
    ).toBe(403);
  }
  expect(await db.catalogApiAudit.count({ where: { tokenId } })).toBe(0);
});

it("rejects DELETE bodies instead of silently ignoring mutation input", async () => {
  const item = await product();
  for (const [handler, context] of [
    [deleteVariant, ctx(item.id, item.variants[0].id)],
    [deleteProduct, ctx(item.id)],
    [deleteCategory, ctx(categoryId)],
  ] as const) {
    const response = await handler(
      req("products/id", "DELETE", { unexpected: true }),
      context,
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_BODY");
  }
  expect(await db.product.count()).toBe(1);
  expect(await db.variant.count()).toBe(2);
  expect(await db.category.count()).toBe(1);
});

it("serializes concurrent variant deletions from different credentials to retain one variant", async () => {
  const item = await product();
  const token = await db.catalogApiToken.findUniqueOrThrow({
    where: { id: tokenId },
  });
  const other = await issueCatalogToken(db, {
    ownerId: token.ownerId,
    name: "other",
    scopes: [...catalogScopes],
    expiresAt: new Date(Date.now() + 3600000),
  });
  const second = req("products/id/variants/id", "DELETE", undefined, "second");
  second.headers.set("authorization", `Bearer ${other.token}`);
  const responses = await Promise.all([
    deleteVariant(
      req("products/id/variants/id", "DELETE"),
      ctx(item.id, item.variants[0].id),
    ),
    deleteVariant(second, ctx(item.id, item.variants[1].id)),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(await db.variant.count({ where: { productId: item.id } })).toBe(1);
});

it("creates distinct category slugs for concurrent requests from different credentials", async () => {
  const token = await db.catalogApiToken.findUniqueOrThrow({
    where: { id: tokenId },
  });
  const other = await issueCatalogToken(db, {
    ownerId: token.ownerId,
    name: "other",
    scopes: [...catalogScopes],
    expiresAt: new Date(Date.now() + 3600000),
  });
  const second = req("categories", "POST", { name: "New" });
  second.headers.set("authorization", `Bearer ${other.token}`);
  const responses = await Promise.all([
    createCategory(req("categories", "POST", { name: "New" })),
    createCategory(second),
  ]);
  expect(responses.map((r) => r.status)).toEqual([201, 201]);
  const results = await Promise.all(responses.map((r) => r.json()));
  expect(results.map((r) => r.data.slug).sort()).toEqual(["new", "new-2"]);
});

it("grants each mutation using only its documented scope", async () => {
  const item = await product();
  const emptyCategory = await db.category.create({
    data: { name: "Empty", slug: "empty" },
  });
  const calls = [
    {
      handler: createCategory,
      method: "POST",
      body: { name: "Scoped" },
      context: ctx("unused"),
      scope: "categories:create",
      status: 201,
    },
    {
      handler: updateCategory,
      method: "PATCH",
      body: { name: "Renamed" },
      context: ctx(categoryId),
      scope: "categories:update",
      status: 200,
    },
    {
      handler: deleteCategory,
      method: "DELETE",
      body: undefined,
      context: ctx(emptyCategory.id),
      scope: "categories:delete",
      status: 200,
    },
    {
      handler: updateVariant,
      method: "PATCH",
      body: { size: "40" },
      context: ctx(item.id, item.variants[0].id),
      scope: "variants:update",
      status: 200,
    },
    {
      handler: deleteVariant,
      method: "DELETE",
      body: undefined,
      context: ctx(item.id, item.variants[0].id),
      scope: "variants:delete",
      status: 200,
    },
    {
      handler: deleteProduct,
      method: "DELETE",
      body: undefined,
      context: ctx(item.id),
      scope: "products:delete",
      status: 200,
    },
  ];
  for (const { handler, method, body, context, scope, status } of calls) {
    await db.catalogApiToken.update({
      where: { id: tokenId },
      data: { scopes: [scope] },
    });
    expect(
      (await handler(req("products/id", method, body), context)).status,
    ).toBe(status);
  }
});

it("binds category update and delete idempotency keys to the category ID", async () => {
  const other = await db.category.create({
    data: { name: "Other", slug: "other" },
  });
  expect(
    (
      await updateCategory(
        req("categories/id", "PATCH", { name: "Renamed" }),
        ctx(categoryId),
      )
    ).status,
  ).toBe(200);
  const update = await updateCategory(
    req("categories/id", "PATCH", { name: "Renamed" }),
    ctx(other.id),
  );
  expect(update.status).toBe(409);
  expect((await update.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
  expect(
    (await deleteCategory(req("categories/id", "DELETE"), ctx(categoryId)))
      .status,
  ).toBe(200);
  const deleted = await deleteCategory(
    req("categories/id", "DELETE"),
    ctx(other.id),
  );
  expect(deleted.status).toBe(409);
  expect((await deleted.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
  expect(
    await db.category.findUniqueOrThrow({ where: { id: other.id } }),
  ).toMatchObject({ name: "Other" });
});

it("rejects a stock update after payment has consumed inventory", async () => {
  const item = await product();
  const variant = item.variants[0];
  const pending = await order(variant.id);
  await markOrderPaidCore(
    db,
    {
      orderId: pending.id,
      provider: "sepay",
      transactionId: `payment:${pending.id}`,
      amount: pending.total,
    },
    { enqueuePaymentConfirmed: async () => undefined },
  );
  const response = await updateVariant(
    req("products/id/variants/id", "PATCH", { stock: 20, expectedStock: 5 }),
    ctx(item.id, variant.id),
  );
  expect(response.status).toBe(409);
  expect((await response.json()).error.code).toBe("STALE_STOCK");
  expect(
    (await db.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock,
  ).toBe(4);
  expect(await db.catalogApiRequest.count({ where: { tokenId } })).toBe(0);
});
