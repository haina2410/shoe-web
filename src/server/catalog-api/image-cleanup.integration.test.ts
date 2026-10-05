// @vitest-environment node
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtemp, mkdir, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PgBoss } from "pg-boss";
import { testPrisma as db, resetDb } from "@/test/db";
import { createTestBoss, resetQueues } from "@/test/boss";
import { ensureQueues, QUEUE_DELETE_PRODUCT_IMAGE } from "@/jobs/queue";
import { registerDeleteProductImageWorker } from "@/worker/index";
import { handleDeleteProductImage } from "@/jobs/handlers/delete-product-image";
import { issueCatalogToken, revokeCatalogToken } from "./tokens";
import { updateCatalogProduct, createCatalogVariant } from "./products";

let boss: PgBoss;
let directory: string;
let tokenId: string;
let productId: string;
let assetId: string;
let url: string;
let filename: string;
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
  await boss.offWork(QUEUE_DELETE_PRODUCT_IMAGE);
  await resetDb();
  await resetQueues(boss);
  directory = await mkdtemp(path.join(tmpdir(), "image-cleanup-"));
  vi.stubEnv("UPLOAD_DIR", directory);
  await mkdir(path.join(directory, "products"));
  const owner = await db.user.upsert({
    where: { email: "cleanup@catalog-api.test" },
    create: {
      id: crypto.randomUUID(),
      name: "Owner",
      email: "cleanup@catalog-api.test",
      role: "owner",
    },
    update: { role: "owner", banned: false },
  });
  tokenId = (
    await issueCatalogToken(db, {
      ownerId: owner.id,
      name: "cleanup",
      scopes: ["products:update", "variants:create"],
      expiresAt: new Date(Date.now() + 3600000),
    })
  ).id;
  url = `/api/uploads/products/catalog-${crypto.randomUUID()}.webp`;
  filename = path.join(directory, "products", path.basename(url));
  await writeFile(filename, "image");
  assetId = (
    await db.catalogApiAsset.create({
      data: {
        tokenId,
        url,
        bytes: 5,
        expiresAt: new Date(Date.now() + 3600000),
        attachedAt: new Date(),
      },
    })
  ).id;
  const category = await db.category.create({
    data: { name: "Shoes", slug: "shoes" },
  });
  productId = (
    await db.product.create({
      data: {
        name: "Shoe",
        slug: "shoe",
        categoryId: category.id,
        basePrice: 100000,
        variants: {
          create: { size: "38", color: "Black", sku: "CLEANUP-38", stock: 5 },
        },
        imageSets: {
          create: {
            color: "Black",
            isDefault: true,
            images: { create: { url } },
          },
        },
      },
    })
  ).id;
});
afterEach(async () => {
  await boss.offWork(QUEUE_DELETE_PRODUCT_IMAGE);
  await db.catalogApiAsset.deleteMany({ where: { tokenId } });
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

it("queues removed images atomically, replays once, and the real worker deletes the file and asset", async () => {
  await updateCatalogProduct(db, tokenId, productId, "remove", {
    imageSets: [],
  });
  await updateCatalogProduct(db, tokenId, productId, "remove", {
    imageSets: [],
  });
  expect(await db.productImage.count()).toBe(0);
  const jobs = await boss.findJobs<{ url: string }>(
    QUEUE_DELETE_PRODUCT_IMAGE,
    {},
  );
  expect(jobs).toHaveLength(1);
  expect(jobs[0].data).toEqual({ url });
  await expect(access(filename)).resolves.toBeUndefined();
  const spy = boss.getSpy<{ url: string }>(QUEUE_DELETE_PRODUCT_IMAGE);
  await registerDeleteProductImageWorker(boss, { db });
  await spy.waitForJob((data) => data.url === url, "completed");
  await expect(access(filename)).rejects.toMatchObject({ code: "ENOENT" });
  expect(
    await db.catalogApiAsset.findUnique({ where: { id: assetId } }),
  ).toBeNull();
  await handleDeleteProductImage({ db }, { url });
});

it("keeps images still referenced by another product", async () => {
  const product = await db.product.findUniqueOrThrow({
    where: { id: productId },
  });
  await db.product.create({
    data: {
      name: "Other",
      slug: "other",
      categoryId: product.categoryId,
      basePrice: 1,
      imageSets: {
        create: {
          color: "Black",
          isDefault: true,
          images: { create: { url } },
        },
      },
    },
  });
  await updateCatalogProduct(db, tokenId, productId, "remove-shared", {
    imageSets: [],
  });
  await handleDeleteProductImage({ db }, { url });
  await expect(access(filename)).resolves.toBeUndefined();
  expect(
    await db.catalogApiAsset.findUnique({ where: { id: assetId } }),
  ).not.toBeNull();
});

it("keeps retained image files and does not enqueue cleanup", async () => {
  await updateCatalogProduct(db, tokenId, productId, "keep", {
    imageSets: [
      {
        color: "Black",
        isDefault: true,
        position: 0,
        images: [{ assetId, position: 0 }],
      },
    ],
  });
  expect(await boss.findJobs(QUEUE_DELETE_PRODUCT_IMAGE, {})).toHaveLength(0);
  await updateCatalogProduct(db, tokenId, productId, "metadata", {
    product: { name: "Edited" },
  });
  expect(await db.productImage.count()).toBe(1);
  await expect(access(filename)).resolves.toBeUndefined();
});

it("rolls back the image update and idempotency record when enqueue fails", async () => {
  await boss.deleteQueue(QUEUE_DELETE_PRODUCT_IMAGE);
  try {
    await expect(
      updateCatalogProduct(db, tokenId, productId, "enqueue-fails", {
        imageSets: [],
      }),
    ).rejects.toThrow();
    expect(await db.productImage.count()).toBe(1);
    expect(await db.catalogApiRequest.count({ where: { tokenId } })).toBe(0);
    await expect(access(filename)).resolves.toBeUndefined();
  } finally {
    await ensureQueues(boss);
  }
});

it("rejects wrong colors and foreign assets before replacing images", async () => {
  await expect(
    updateCatalogProduct(db, tokenId, productId, "wrong-color", {
      imageSets: [
        {
          color: "White",
          isDefault: true,
          position: 0,
          images: [{ assetId, position: 0 }],
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
  await expect(
    updateCatalogProduct(db, tokenId, productId, "wrong-asset", {
      imageSets: [
        {
          color: "Black",
          isDefault: true,
          position: 0,
          images: [{ assetId: "missing", position: 0 }],
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "INVALID_ASSET" });
  expect(await db.productImage.count()).toBe(1);
});

it("deletes removed legacy local uploads", async () => {
  const legacyUrl = `/api/uploads/products/${crypto.randomUUID()}.jpg`;
  const legacyFile = path.join(directory, "products", path.basename(legacyUrl));
  await writeFile(legacyFile, "legacy");
  await handleDeleteProductImage({ db }, { url: legacyUrl });
  await expect(access(legacyFile)).rejects.toMatchObject({ code: "ENOENT" });
});

it("enforces the variant limit across simultaneous mutations from different tokens", async () => {
  await db.variant.createMany({
    data: Array.from({ length: 98 }, (_, index) => ({
      productId,
      sku: `LIMIT-${index}`,
      color: "Black",
      size: `SIZE-${index}`,
      stock: 1,
    })),
  });
  const token = await db.catalogApiToken.findUniqueOrThrow({
    where: { id: tokenId },
  });
  const other = await issueCatalogToken(db, {
    ownerId: token.ownerId,
    name: "other",
    scopes: ["variants:create"],
    expiresAt: new Date(Date.now() + 3600000),
  });
  const results = await Promise.allSettled([
    createCatalogVariant(db, tokenId, productId, "last-one", {
      size: "New-A",
      color: "Black",
      sku: "LIMIT-A",
      stock: 1,
    }),
    createCatalogVariant(db, other.id, productId, "last-two", {
      size: "New-B",
      color: "Black",
      sku: "LIMIT-B",
      stock: 1,
    }),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  const rejected = results.find((result) => result.status === "rejected");
  expect(rejected).toMatchObject({
    status: "rejected",
    reason: { code: "VARIANT_LIMIT", status: 422 },
  });
  expect(await db.variant.count({ where: { productId } })).toBe(100);
});

it("rechecks revoked credentials inside both mutation transactions", async () => {
  await revokeCatalogToken(db, tokenId);
  await expect(
    updateCatalogProduct(db, tokenId, productId, "revoked-update", {
      product: { name: "Changed" },
    }),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    createCatalogVariant(db, tokenId, productId, "revoked-variant", {
      size: "39",
      color: "Black",
      sku: "REVOKED",
      stock: 1,
    }),
  ).rejects.toMatchObject({ status: 401 });
  expect(
    (await db.product.findUniqueOrThrow({ where: { id: productId } })).name,
  ).toBe("Shoe");
  expect(await db.variant.count({ where: { productId } })).toBe(1);
});
