// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { testPrisma as db, resetDb } from "@/test/db";
import {
  issueCatalogToken,
  authenticateCatalogRequest,
  revokeCatalogToken,
} from "./tokens";
import { createCatalogProduct, validateCatalogProduct } from "./products";
import { catalogProductSchema } from "./schema";

let ownerId: string;
beforeEach(async () => {
  await resetDb();
  await db.catalogApiAsset.deleteMany({
    where: { token: { owner: { email: { endsWith: "@catalog-api.test" } } } },
  });
  await db.user.deleteMany({
    where: { email: { endsWith: "@catalog-api.test" } },
  });
  ownerId = (
    await db.user.create({
      data: {
        id: crypto.randomUUID(),
        name: "Owner",
        email: "owner@catalog-api.test",
        role: "owner",
      },
    })
  ).id;
});
afterEach(async () => {
  await db.catalogApiAsset.deleteMany({ where: { token: { ownerId } } });
  await db.user.delete({ where: { id: ownerId } });
});
const scopes = ["catalog:read", "products:create", "images:write"] as const;
async function token() {
  return issueCatalogToken(db, {
    ownerId,
    name: "test",
    scopes: [...scopes],
    expiresAt: new Date(Date.now() + 3600000),
  });
}
function request(secret?: string) {
  return new Request("https://shop.test/api/admin/products", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}
async function input(sku = "SHOE-BLK-38") {
  const category = await db.category.create({
    data: { name: "Shoes", slug: crypto.randomUUID() },
  });
  return catalogProductSchema.parse({
    product: { name: "Black shoe", categoryId: category.id, basePrice: 350000 },
    variants: [{ size: "38", color: "Black", sku, stock: 5 }],
  });
}

describe("catalog credentials", () => {
  it("stores only a hash and authenticates an owner with the required scope", async () => {
    const issued = await token();
    const record = await db.catalogApiToken.findUniqueOrThrow({
      where: { id: issued.id },
    });
    expect(JSON.stringify(record)).not.toContain(issued.token);
    expect(
      (
        await authenticateCatalogRequest(
          db,
          request(issued.token),
          "products:create",
        )
      ).id,
    ).toBe(issued.id);
    await expect(
      authenticateCatalogRequest(db, request(), "products:create"),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      authenticateCatalogRequest(db, request("invalid"), "products:create"),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("rejects expired, revoked, demoted, banned, and insufficient-scope credentials", async () => {
    const issued = await token();
    await revokeCatalogToken(db, issued.id);
    await expect(
      authenticateCatalogRequest(db, request(issued.token), "catalog:read"),
    ).rejects.toMatchObject({ status: 401 });
    const expired = await token();
    await db.catalogApiToken.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      authenticateCatalogRequest(db, request(expired.token), "catalog:read"),
    ).rejects.toMatchObject({ status: 401 });
    const readOnly = await issueCatalogToken(db, {
      ownerId,
      name: "read",
      scopes: ["catalog:read"],
      expiresAt: new Date(Date.now() + 3600000),
    });
    await expect(
      authenticateCatalogRequest(
        db,
        request(readOnly.token),
        "products:create",
      ),
    ).rejects.toMatchObject({ status: 403 });
    await db.user.update({ where: { id: ownerId }, data: { banned: true } });
    await expect(
      authenticateCatalogRequest(db, request(readOnly.token), "catalog:read"),
    ).rejects.toMatchObject({ status: 403 });
    await db.user.update({
      where: { id: ownerId },
      data: { banned: false, role: "staff" },
    });
    await expect(
      authenticateCatalogRequest(db, request(readOnly.token), "catalog:read"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(token()).rejects.toMatchObject({ status: 403 });
  });
  it("enforces the request budget atomically", async () => {
    const issued = await token();
    await db.catalogApiToken.update({
      where: { id: issued.id },
      data: {
        rateWindow: new Date(Math.floor(Date.now() / 60000) * 60000),
        requestCount: 59,
      },
    });
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        authenticateCatalogRequest(db, request(issued.token), "catalog:read"),
      ),
    );
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      attempts
        .filter((r) => r.status === "rejected")
        .map((r) => r.reason.status),
    ).toEqual([429, 429, 429]);
  });
});

describe("catalog creation", () => {
  it("validates without writing and atomically replays concurrent retries", async () => {
    const issued = await token();
    const body = await input();
    await validateCatalogProduct(db, issued.id, body);
    expect(await db.product.count()).toBe(0);
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        createCatalogProduct(db, issued.id, "batch-1-row-1", body),
      ),
    );
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(new Set(results.map((r) => r.data.id)).size).toBe(1);
    expect(await db.product.count()).toBe(1);
    const saved = await db.product.findFirstOrThrow({
      include: { variants: true },
    });
    expect(saved.status).toBe("DRAFT");
    expect(saved.variants[0]).toMatchObject({ sku: "SHOE-BLK-38", stock: 5 });
    expect(
      await db.catalogApiAudit.count({
        where: { tokenId: issued.id, operation: "products:create" },
      }),
    ).toBe(1);
    await expect(
      createCatalogProduct(db, issued.id, "batch-1-row-1", {
        ...body,
        product: { ...body.product, basePrice: 1 },
      }),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
  });
  it("rejects SKU conflicts and missing categories without partial writes", async () => {
    const issued = await token();
    const body = await input();
    await createCatalogProduct(db, issued.id, "first", body);
    await expect(
      createCatalogProduct(db, issued.id, "second", body),
    ).rejects.toMatchObject({ status: 409, code: "SKU_CONFLICT" });
    await expect(
      createCatalogProduct(db, issued.id, "missing", {
        ...body,
        product: { ...body.product, categoryId: "absent" },
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(await db.product.count()).toBe(1);
    expect(
      await db.catalogApiRequest.count({ where: { tokenId: issued.id } }),
    ).toBe(1);
  });
  it("keeps the original idempotent response after the draft changes", async () => {
    const issued = await token();
    const body = await input();
    const first = await createCatalogProduct(db, issued.id, "snapshot", body);
    await db.product.update({
      where: { id: first.data.id },
      data: { name: "Edited later" },
    });
    const replay = await createCatalogProduct(db, issued.id, "snapshot", body);
    expect(replay.data).toEqual(first.data);
    expect(replay.data.name).toBe("Black shoe");
  });
  it("rejects revoked tokens again at the mutation boundary", async () => {
    const issued = await token();
    const body = await input();
    await revokeCatalogToken(db, issued.id);
    await expect(
      createCatalogProduct(db, issued.id, "revoked", body),
    ).rejects.toMatchObject({ status: 401 });
    expect(await db.product.count()).toBe(0);
  });
  it("rejects a missing backing image before validating or creating a product", async () => {
    const issued = await token();
    const body = await input();
    const asset = await db.catalogApiAsset.create({
      data: {
        tokenId: issued.id,
        url: `/api/uploads/products/catalog-${crypto.randomUUID()}.webp`,
        bytes: 10,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const withAsset = {
      ...body,
      imageSets: [
        {
          color: "Black",
          position: 0,
          isDefault: true,
          images: [{ assetId: asset.id, position: 0 }],
        },
      ],
    };
    await expect(
      validateCatalogProduct(db, issued.id, withAsset),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_ASSET" });
    await expect(
      createCatalogProduct(db, issued.id, "missing-file", withAsset),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_ASSET" });
    expect(await db.product.count()).toBe(0);
    expect(
      await db.catalogApiRequest.count({ where: { tokenId: issued.id } }),
    ).toBe(0);
  });
  it("rejects non-owned, expired, and fabricated asset references", async () => {
    const issued = await token();
    const other = await token();
    const body = await input();
    const asset = await db.catalogApiAsset.create({
      data: {
        tokenId: other.id,
        url: "/api/uploads/products/example.webp",
        bytes: 10,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const withAsset = {
      ...body,
      imageSets: [
        {
          color: "Black",
          position: 0,
          isDefault: true,
          images: [{ assetId: asset.id, position: 0 }],
        },
      ],
    };
    await expect(
      createCatalogProduct(db, issued.id, "wrong-owner", withAsset),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_ASSET" });
    await db.catalogApiAsset.update({
      where: { id: asset.id },
      data: { tokenId: issued.id, expiresAt: new Date(0) },
    });
    await expect(
      createCatalogProduct(db, issued.id, "expired", withAsset),
    ).rejects.toMatchObject({ status: 422 });
    expect(await db.product.count()).toBe(0);
  });
});
