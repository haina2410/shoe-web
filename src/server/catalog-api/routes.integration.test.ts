// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { cleanupCatalogImages } from "./images";
import { testPrisma as db, resetDb } from "@/test/db";
import { issueCatalogToken } from "./tokens";
vi.mock("@/lib/prisma", async () => ({
  prisma: (await import("@/test/db")).testPrisma,
}));
import { GET as categories } from "@/app/api/admin/categories/route";
import { POST as create } from "@/app/api/admin/products/route";
import { POST as validate } from "@/app/api/admin/products/validate/route";
import { POST as addVariant } from "@/app/api/admin/products/[id]/variants/route";
import {
  GET as detail,
  PATCH as update,
} from "@/app/api/admin/products/[id]/route";
import { POST as image } from "@/app/api/admin/images/route";
let secret: string;
let tokenId: string;
let categoryId: string;
beforeEach(async () => {
  await resetDb();
  const owner = await db.user.upsert({
    where: { email: "routes@catalog-api.test" },
    create: {
      id: crypto.randomUUID(),
      name: "Owner",
      email: "routes@catalog-api.test",
      role: "owner",
    },
    update: { role: "owner", banned: false },
  });
  const issued = await issueCatalogToken(db, {
    ownerId: owner.id,
    name: "route",
    scopes: [
      "catalog:read",
      "products:create",
      "images:write",
      "products:update",
      "variants:create",
    ],
    expiresAt: new Date(Date.now() + 3600000),
  });
  secret = issued.token;
  tokenId = issued.id;
  categoryId = (
    await db.category.create({ data: { name: "Shoes", slug: "shoes" } })
  ).id;
});
function req(path: string, method = "GET", body?: unknown, authorized = true) {
  return new Request(`https://shop.test/api/admin/${path}`, {
    method,
    headers: {
      ...(authorized ? { authorization: `Bearer ${secret}` } : {}),
      "content-type": "application/json",
      "idempotency-key": "route-create",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
describe("catalog HTTP boundary", () => {
  it("rejects unauthenticated access on every endpoint, including malformed bodies", async () => {
    const responses = await Promise.all([
      categories(req("categories", "GET", undefined, false)),
      create(req("products", "POST", {}, false)),
      validate(req("products/validate", "POST", {}, false)),
      detail(req("products/id", "GET", undefined, false), {
        params: Promise.resolve({ id: "id" }),
      }),
      image(req("images", "POST", {}, false)),
      update(req("products/id", "PATCH", {}, false), {
        params: Promise.resolve({ id: "id" }),
      }),
      addVariant(req("products/id/variants", "POST", {}, false), {
        params: Promise.resolve({ id: "id" }),
      }),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    }
    expect(await db.product.count()).toBe(0);
  });
  it("lists categories, validates, creates, replays, and reads the draft", async () => {
    const categoryResponse = await categories(req("categories"));
    expect(categoryResponse.status).toBe(200);
    expect((await categoryResponse.json()).data[0].id).toBe(categoryId);
    const body = {
      product: { name: "Shoe", categoryId, basePrice: 100000 },
      variants: [{ sku: "HTTP-1", color: "Black", size: "38", stock: 1 }],
    };
    expect(
      (await validate(req("products/validate", "POST", body))).status,
    ).toBe(200);
    expect(await db.product.count()).toBe(0);
    const created = await create(req("products", "POST", body));
    expect(created.status).toBe(201);
    const record = (await created.json()).data;
    expect(record.status).toBe("DRAFT");
    expect((await create(req("products", "POST", body))).status).toBe(200);
    const read = await detail(req(`products/${record.id}`), {
      params: Promise.resolve({ id: record.id }),
    });
    expect((await read.json()).data.variants[0].sku).toBe("HTTP-1");
    expect(
      (
        await detail(req("products/missing"), {
          params: Promise.resolve({ id: "missing" }),
        })
      ).status,
    ).toBe(404);
  });
  it("uploads a local image and attaches it to a draft without losing it to cleanup", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "catalog-flow-"));
    vi.stubEnv("UPLOAD_DIR", directory);
    let assetId: string | undefined;
    try {
      const bytes = await sharp({
        create: { width: 16, height: 16, channels: 3, background: "red" },
      })
        .png()
        .toBuffer();
      const uploaded = await image(
        new Request("https://shop.test/api/admin/images", {
          method: "POST",
          headers: {
            authorization: `Bearer ${secret}`,
            "content-type": "image/png",
            "idempotency-key": "photo-001",
          },
          body: new Uint8Array(bytes),
        }),
      );
      expect(uploaded.status).toBe(201);
      const asset = (await uploaded.json()).data;
      assetId = asset.id;
      const body = {
        product: { name: "Shoe with photo", categoryId, basePrice: 350000 },
        variants: [{ sku: "HTTP-PHOTO", color: "Black", size: "38", stock: 5 }],
        imageSets: [
          {
            color: "Black",
            position: 0,
            isDefault: true,
            images: [{ assetId: asset.id, position: 0 }],
          },
        ],
      };
      expect(
        (await validate(req("products/validate", "POST", body))).status,
      ).toBe(200);
      const created = await create(req("products", "POST", body));
      expect(created.status).toBe(201);
      const product = (await created.json()).data;
      const saved = await detail(req(`products/${product.id}`), {
        params: Promise.resolve({ id: product.id }),
      });
      expect((await saved.json()).data.imageSets[0].images[0].url).toBe(
        asset.url,
      );
      expect(
        (
          await db.catalogApiAsset.findUniqueOrThrow({
            where: { id: asset.id },
          })
        ).attachedAt,
      ).not.toBeNull();
      await db.catalogApiAsset.update({
        where: { id: asset.id },
        data: { expiresAt: new Date(0) },
      });
      await cleanupCatalogImages(db);
      const persisted = await readFile(
        path.join(directory, "products", path.basename(asset.url)),
      );
      expect(await sharp(persisted).metadata()).toMatchObject({
        format: "webp",
        width: 16,
        height: 16,
      });
    } finally {
      if (assetId)
        await db.catalogApiAsset.deleteMany({ where: { id: assetId } });
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("returns structured validation errors and rejects missing idempotency keys", async () => {
    const invalid = await create(
      req("products", "POST", { ownerId: "unexpected" }),
    );
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error.code).toBe("VALIDATION_ERROR");
    const body = {
      product: { name: "Shoe", categoryId, basePrice: 100000 },
      variants: [{ sku: "HTTP-2", color: "Black", size: "38", stock: 1 }],
    };
    const request = req("products", "POST", body);
    request.headers.delete("idempotency-key");
    expect((await create(request)).status).toBe(400);
    expect(await db.product.count()).toBe(0);
  });
});

async function existingProduct() {
  const response = await create(
    req("products", "POST", {
      product: {
        name: "Original shoe",
        description: "Keep this",
        categoryId,
        basePrice: 100000,
      },
      variants: [{ sku: "ORIGINAL-38", color: "Black", size: "38", stock: 5 }],
    }),
  );
  expect(response.status).toBe(201);
  return (await response.json()).data;
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("catalog editing HTTP boundary", () => {
  it("patches product fields and status while preserving slug, variants, and omitted fields", async () => {
    const product = await existingProduct();
    const response = await update(
      req(`products/${product.id}`, "PATCH", {
        product: {
          name: "  Updated shoe  ",
          basePrice: 200000,
          status: "ACTIVE",
        },
      }),
      ctx(product.id),
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.replayed).toBe(false);
    expect(result.data).toMatchObject({
      name: "Updated shoe",
      basePrice: 200000,
      status: "ACTIVE",
      description: "Keep this",
      slug: product.slug,
    });
    expect(result.data.variants).toEqual(product.variants);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: product.id } }))
        .nameNormalized,
    ).toBe("updated shoe");
    const clear = req(`products/${product.id}`, "PATCH", {
      product: { description: null, status: "ARCHIVED" },
    });
    clear.headers.set("idempotency-key", "clear-description");
    expect((await update(clear, ctx(product.id))).status).toBe(200);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: product.id } }))
        .description,
    ).toBeNull();
  });
  it("replays updates as snapshots and binds the key to the target product", async () => {
    const product = await existingProduct();
    const body = { product: { basePrice: 200000 } };
    const first = await (
      await update(req("products/id", "PATCH", body), ctx(product.id))
    ).json();
    await db.product.update({
      where: { id: product.id },
      data: { basePrice: 300000 },
    });
    const replay = await (
      await update(req("products/id", "PATCH", body), ctx(product.id))
    ).json();
    expect(replay).toMatchObject({ replayed: true, data: first.data });
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: product.id } }))
        .basePrice,
    ).toBe(300000);
    expect(
      (await update(req("products/other", "PATCH", body), ctx("other"))).status,
    ).toBe(409);
    expect(
      await db.catalogApiAudit.count({
        where: { tokenId, operation: "products:update" },
      }),
    ).toBe(1);
  });
  it("rejects empty, unknown, and invalid updates without changing the product", async () => {
    const product = await existingProduct();
    for (const body of [
      {},
      { product: {} },
      { variants: [] },
      { product: { slug: "changed" } },
      { product: { basePrice: -1 } },
      { product: { status: "PUBLISHED" } },
    ]) {
      expect(
        (await update(req("products/id", "PATCH", body), ctx(product.id)))
          .status,
      ).toBe(422);
    }
    const invalidCategory = await update(
      req("products/id", "PATCH", {
        product: { name: "Wrong", categoryId: "missing" },
      }),
      ctx(product.id),
    );
    expect((await invalidCategory.json()).error.code).toBe("INVALID_CATEGORY");
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: product.id } })).name,
    ).toBe("Original shoe");
    expect(
      (
        await update(
          req("products/id", "PATCH", { product: { name: "New" } }),
          ctx("missing"),
        )
      ).status,
    ).toBe(404);
  });
  it("creates a variant once on concurrent retries without replacing existing variants", async () => {
    const product = await existingProduct();
    const body = {
      size: " 39 ",
      color: "Black",
      sku: "NEW-39",
      stock: 4,
      priceOverride: 150000,
    };
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        addVariant(req("products/id/variants", "POST", body), ctx(product.id)),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    const results = await Promise.all(responses.map((r) => r.json()));
    expect(new Set(results.map((r) => r.data.id)).size).toBe(1);
    expect(results[0].data).toMatchObject({
      productId: product.id,
      size: "39",
      stock: 4,
      priceOverride: 150000,
    });
    expect(
      await db.variant.findUniqueOrThrow({
        where: { id: product.variants[0].id },
      }),
    ).toEqual({ ...product.variants[0] });
    expect(await db.variant.count({ where: { productId: product.id } })).toBe(
      2,
    );
    expect(
      await db.catalogApiAudit.count({
        where: { tokenId, operation: "variants:create" },
      }),
    ).toBe(1);
    expect(
      (
        await addVariant(
          req("products/id/variants", "POST", { ...body, stock: 6 }),
          ctx(product.id),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await addVariant(
          req("products/other/variants", "POST", body),
          ctx("other"),
        )
      ).status,
    ).toBe(409);
  });
  it("rejects variant conflicts, invalid input, and missing products", async () => {
    const product = await existingProduct();
    for (const body of [
      { size: "39", color: "Black", sku: "ORIGINAL-38", stock: 1 },
      { size: "38", color: "Black", sku: "OTHER-38", stock: 1 },
    ]) {
      expect(
        (
          await addVariant(
            req("products/id/variants", "POST", body),
            ctx(product.id),
          )
        ).status,
      ).toBe(409);
    }
    expect(
      (
        await addVariant(
          req("products/id/variants", "POST", {
            size: "39",
            color: "Black",
            sku: "NEW",
            stock: -1,
          }),
          ctx(product.id),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await addVariant(
          req("products/id/variants", "POST", {
            size: "39",
            color: "Black",
            sku: "NEW",
            stock: 1,
          }),
          ctx("missing"),
        )
      ).status,
    ).toBe(404);
    expect(await db.variant.count()).toBe(1);
  });
  it("requires the new scopes and idempotency keys", async () => {
    const product = await existingProduct();
    const variant = { size: "39", color: "Black", sku: "NEW", stock: 1 };
    for (const [handler, body, method] of [
      [update, { product: { name: "New" } }, "PATCH"],
      [addVariant, variant, "POST"],
    ] as const) {
      const request = req("products/id", method, body);
      request.headers.delete("idempotency-key");
      expect((await handler(request, ctx(product.id))).status).toBe(400);
    }
    await db.catalogApiToken.update({
      where: { id: tokenId },
      data: { scopes: ["catalog:read", "products:create", "images:write"] },
    });
    expect(
      (
        await update(
          req("products/id", "PATCH", { product: { name: "New" } }),
          ctx(product.id),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await addVariant(
          req("products/id/variants", "POST", variant),
          ctx(product.id),
        )
      ).status,
    ).toBe(403);
  });
});
