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
import { GET as detail } from "@/app/api/admin/products/[id]/route";
import { POST as image } from "@/app/api/admin/images/route";
let secret: string;
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
  secret = (
    await issueCatalogToken(db, {
      ownerId: owner.id,
      name: "route",
      scopes: ["catalog:read", "products:create", "images:write"],
      expiresAt: new Date(Date.now() + 3600000),
    })
  ).token;
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
