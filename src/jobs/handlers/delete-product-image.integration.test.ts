// @vitest-environment node
import { randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testPrisma as db } from "@/test/db";
import { issueCatalogToken } from "@/server/catalog-api/tokens";
import { handleDeleteProductImage } from "@/jobs/handlers/delete-product-image";

const imageUrl = () => `/api/uploads/products/${randomUUID()}.webp`;
let directory = "";
let categoryId = "";
let productId = "";
let imageUrlValue = "";

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "delete-product-image-"));
  vi.stubEnv("UPLOAD_DIR", directory);
  categoryId = (await db.category.create({
    data: { name: `Image test ${randomUUID()}`, slug: randomUUID() },
  })).id;
});

afterEach(async () => {
  if (productId) await db.product.deleteMany({ where: { id: productId } });
  if (categoryId) await db.category.deleteMany({ where: { id: categoryId } });
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
  categoryId = "";
  productId = "";
});

async function createReferencedProduct(url: string) {
  const product = await db.product.create({
    data: {
      name: `Image product ${randomUUID()}`,
      slug: randomUUID(),
      categoryId,
      basePrice: 100,
      imageSets: {
        create: { color: "Black", images: { create: { url } } },
      },
    },
  });
  productId = product.id;
}

function imagePath(url: string) {
  return path.join(directory, "products", path.basename(url));
}

describe("handleDeleteProductImage", () => {
  it("keeps a managed file referenced by any product", async () => {
    imageUrlValue = imageUrl();
    await mkdir(path.dirname(imagePath(imageUrlValue)), { recursive: true });
    await writeFile(imagePath(imageUrlValue), "image");
    await createReferencedProduct(imageUrlValue);

    await handleDeleteProductImage({ db }, { url: imageUrlValue });

    expect((await lstat(imagePath(imageUrlValue))).isFile()).toBe(true);
  });

  it("unlinks an unreferenced image and preserves API request history", async () => {
    imageUrlValue = `/api/uploads/products/catalog-${randomUUID()}.webp`;
    await mkdir(path.dirname(imagePath(imageUrlValue)), { recursive: true });
    await writeFile(imagePath(imageUrlValue), "image");
    const owner = await db.user.create({
      data: { id: randomUUID(), name: "Image owner", email: `${randomUUID()}@image.test`, role: "owner" },
    });
    const token = await issueCatalogToken(db, {
      ownerId: owner.id,
      name: "image test",
      scopes: ["images:write"],
      expiresAt: new Date(Date.now() + 3600000),
    });
    const asset = await db.catalogApiAsset.create({
      data: { tokenId: token.id, url: imageUrlValue, bytes: 5, expiresAt: new Date(Date.now() + 3600000) },
    });
    const request = await db.catalogApiRequest.create({
      data: {
        tokenId: token.id,
        operation: "images:write",
        key: "remove-image",
        payloadHash: "hash",
        response: { id: asset.id, url: imageUrlValue, bytes: 5, expiresAt: new Date().toISOString() },
      },
    });

    await handleDeleteProductImage({ db }, { url: imageUrlValue });

    await expect(lstat(imagePath(imageUrlValue))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await db.catalogApiAsset.findUnique({ where: { id: asset.id } })).toBeNull();
    expect(await db.catalogApiRequest.findUnique({ where: { id: request.id } })).not.toBeNull();
    await db.catalogApiToken.delete({ where: { id: token.id } });
    await db.user.delete({ where: { id: owner.id } });
  });

  it("refuses to delete through a symlinked products directory", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "outside-images-"));
    const url = imageUrl();
    const target = path.join(outside, path.basename(url));
    try {
      await writeFile(target, "safe");
      await symlink(outside, path.join(directory, "products"));
      await expect(handleDeleteProductImage({ db }, { url })).rejects.toThrow();
      expect((await lstat(target)).isFile()).toBe(true);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("treats a missing file as complete and rejects paths outside managed uploads", async () => {
    await expect(
      handleDeleteProductImage({ db }, { url: imageUrl() }),
    ).resolves.toBeUndefined();
    await expect(
      handleDeleteProductImage({ db }, { url: "/api/uploads/products/../../secret" }),
    ).rejects.toThrow();
  });
});
