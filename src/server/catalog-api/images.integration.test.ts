// @vitest-environment node
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  readdir,
  writeFile,
  unlink,
  mkdir,
  utimes,
  lstat,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testPrisma as db } from "@/test/db";
import { issueCatalogToken } from "./tokens";
import {
  assertCatalogImageAvailable,
  cleanupCatalogImages,
  uploadCatalogImage,
} from "./images";

let ownerId: string;
let tokenId: string;
let directory: string;
let png: Buffer;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "catalog-images-"));
  vi.stubEnv("UPLOAD_DIR", directory);
  ownerId = randomUUID();
  await db.user.create({
    data: {
      id: ownerId,
      name: "Owner",
      email: `${ownerId}@catalog-image.test`,
      role: "owner",
    },
  });
  tokenId = (
    await issueCatalogToken(db, {
      ownerId,
      name: "images",
      scopes: ["images:write"],
      expiresAt: new Date(Date.now() + 3600000),
    })
  ).id;
  png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
});
afterEach(async () => {
  await db.catalogApiAsset.deleteMany({ where: { tokenId } });
  await db.user.delete({ where: { id: ownerId } });
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
const upload = (key: string, bytes = png, mime = "image/png") =>
  uploadCatalogImage(db, tokenId, key, bytes, mime);
const file = (url: string) =>
  path.join(directory, "products", path.basename(url));

describe("catalog image uploads", () => {
  it("transforms actual pixels into WebP and replays concurrent retries once", async () => {
    const results = await Promise.all([upload("same"), upload("same")]);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(results[0].data).toEqual(results[1].data);
    expect(results[0].data.url).toMatch(
      /^\/api\/uploads\/products\/catalog-[a-f0-9-]{36}\.webp$/,
    );
    const bytes = await readFile(file(results[0].data.url));
    expect(await sharp(bytes).metadata()).toMatchObject({
      format: "webp",
      width: 16,
      height: 16,
    });
    expect(results[0].data.bytes).toBe(bytes.length);
    expect(new Date(results[0].data.expiresAt).getTime()).toBeGreaterThan(
      Date.now() + 23 * 3600000,
    );
    expect(await readdir(path.join(directory, "products"))).toHaveLength(1);
    expect(await db.catalogApiAudit.count({ where: { tokenId } })).toBe(1);
    await expect(
      upload("same", await sharp(png).jpeg().toBuffer(), "image/jpeg"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(upload("same", png, "image/jpeg")).rejects.toMatchObject({
      status: 409,
    });
  });
  it("rejects spoofed, undecodable, unsupported, oversized and excessive-dimension images", async () => {
    await expect(upload("spoof", png, "image/jpeg")).rejects.toMatchObject({
      status: 415,
    });
    await expect(
      upload("bad", Buffer.from("not an image")),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      upload(
        "svg",
        Buffer.from('<svg width="10" height="10"></svg>'),
        "image/svg+xml",
      ),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      upload("large", Buffer.alloc(5 * 1024 * 1024 + 1)),
    ).rejects.toMatchObject({ status: 413 });
    const wide = await sharp({
      create: { width: 8193, height: 1, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    await expect(upload("wide", wide)).rejects.toMatchObject({ status: 413 });
    expect(await db.catalogApiAsset.count({ where: { tokenId } })).toBe(0);
  });
  it("rejects animation and pixel decompression bombs", async () => {
    const animated = await sharp(
      Buffer.concat([Buffer.alloc(12, 0), Buffer.alloc(12, 255)]),
      { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } },
    )
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    await expect(
      upload("animated", animated, "image/webp"),
    ).rejects.toMatchObject({ status: 415 });
    const bomb = await sharp({
      create: { width: 4001, height: 4000, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(upload("pixels", bomb)).rejects.toMatchObject({ status: 413 });
  });
  it("accepts actual JPEG and WebP inputs", async () => {
    const jpeg = await upload(
      "jpeg",
      await sharp(png).jpeg().toBuffer(),
      "image/jpeg",
    );
    const webp = await upload(
      "webp",
      await sharp(png).webp().toBuffer(),
      "image/webp",
    );
    expect(
      (await sharp(await readFile(file(jpeg.data.url))).metadata()).format,
    ).toBe("webp");
    expect(
      (await sharp(await readFile(file(webp.data.url))).metadata()).format,
    ).toBe("webp");
  });
  it("does not consume an idempotency key when disk writes fail", async () => {
    await writeFile(path.join(directory, "products"), "blocked");
    await expect(upload("retry-disk")).rejects.toBeDefined();
    expect(await db.catalogApiAsset.count({ where: { tokenId } })).toBe(0);
    expect(await db.catalogApiRequest.count({ where: { tokenId } })).toBe(0);
    await unlink(path.join(directory, "products"));
    expect((await upload("retry-disk")).replayed).toBe(false);
  });
  it("returns an explicit gone response when a replayed file is missing", async () => {
    const saved = await upload("missing-file");
    await unlink(file(saved.data.url));
    await expect(upload("missing-file")).rejects.toMatchObject({
      status: 410,
      code: "ASSET_EXPIRED",
    });
    expect(await db.catalogApiRequest.count({ where: { tokenId } })).toBe(1);
  });
  it("validates that product image references resolve to regular local files", async () => {
    const saved = await upload("available");
    await expect(
      assertCatalogImageAvailable(saved.data.url),
    ).resolves.toBeUndefined();
    await unlink(file(saved.data.url));
    await expect(
      assertCatalogImageAvailable(saved.data.url),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_ASSET" });
    await mkdir(file(saved.data.url));
    await expect(
      assertCatalogImageAvailable(saved.data.url),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_ASSET" });
    await expect(
      assertCatalogImageAvailable("/api/uploads/products/../../secret"),
    ).rejects.toMatchObject({ status: 422, code: "INVALID_ASSET" });
  });
  it("removes old catalog crash-orphans while preserving recent, tracked, referenced and session files", async () => {
    const tracked = await upload("tracked");
    const attached = await upload("attached-old");
    await db.catalogApiAsset.update({
      where: { id: attached.data.id },
      data: { attachedAt: new Date() },
    });
    const urls = Object.fromEntries(
      ["orphan", "recent", "referenced", "directory", "link"].map((kind) => [
        kind,
        `/api/uploads/products/catalog-${randomUUID()}.webp`,
      ]),
    );
    const sessionUrl = `/api/uploads/products/${randomUUID()}.webp`;
    const old = new Date(Date.now() - 25 * 3600000);
    for (const url of [urls.orphan, urls.recent, urls.referenced, sessionUrl])
      await writeFile(file(url), png);
    for (const url of [
      urls.orphan,
      urls.referenced,
      sessionUrl,
      tracked.data.url,
      attached.data.url,
    ])
      await utimes(file(url), old, old);
    await mkdir(file(urls.directory));
    await utimes(file(urls.directory), old, old);
    await symlink(file(sessionUrl), file(urls.link));
    const category = await db.category.create({
      data: { name: "Images", slug: randomUUID() },
    });
    const product = await db.product.create({
      data: {
        name: "Referenced",
        slug: randomUUID(),
        categoryId: category.id,
        basePrice: 100,
        imageSets: {
          create: {
            color: "Black",
            images: { create: { url: urls.referenced } },
          },
        },
      },
    });
    try {
      await cleanupCatalogImages(db);
      await expect(lstat(file(urls.orphan))).rejects.toMatchObject({
        code: "ENOENT",
      });
      for (const url of [
        urls.recent,
        urls.referenced,
        sessionUrl,
        tracked.data.url,
        attached.data.url,
      ])
        expect((await lstat(file(url))).isFile()).toBe(true);
      expect((await lstat(file(urls.directory))).isDirectory()).toBe(true);
      expect((await lstat(file(urls.link))).isSymbolicLink()).toBe(true);
    } finally {
      await db.product.delete({ where: { id: product.id } });
      await db.category.delete({ where: { id: category.id } });
    }
  });
  it("continues cleaning expired tracked assets with legacy filenames", async () => {
    const url = `/api/uploads/products/${randomUUID()}.webp`;
    await mkdir(path.join(directory, "products"));
    await writeFile(file(url), png);
    const asset = await db.catalogApiAsset.create({
      data: { tokenId, url, bytes: png.length, expiresAt: new Date(0) },
    });
    await cleanupCatalogImages(db);
    await expect(lstat(file(url))).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      await db.catalogApiAsset.findUnique({ where: { id: asset.id } }),
    ).toBeNull();
  });
  it("checks owner role at the mutation boundary", async () => {
    await db.user.update({ where: { id: ownerId }, data: { role: "staff" } });
    await expect(upload("staff")).rejects.toMatchObject({ status: 403 });
    expect(await db.catalogApiAsset.count({ where: { tokenId } })).toBe(0);
  });
  it("enforces tracked storage quota under concurrent uploads", async () => {
    const encoded = await sharp(png).rotate().webp().toBuffer();
    await db.catalogApiAsset.create({
      data: {
        tokenId,
        url: `/api/uploads/products/${randomUUID()}.webp`,
        bytes: 250 * 1024 * 1024 - encoded.length,
        expiresAt: new Date(Date.now() + 3600000),
        attachedAt: new Date(),
      },
    });
    const results = await Promise.allSettled([upload("one"), upload("two")]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected")[0],
    ).toMatchObject({
      reason: { status: 413, code: "STORAGE_QUOTA_EXCEEDED" },
    });
  });
  it("cleans expired unattached files while preserving attachments and retry history", async () => {
    const expired = await upload("expired");
    const attached = await upload("attached");
    await db.catalogApiAsset.update({
      where: { id: expired.data.id },
      data: { expiresAt: new Date(0) },
    });
    await db.catalogApiAsset.update({
      where: { id: attached.data.id },
      data: { expiresAt: new Date(0), attachedAt: new Date() },
    });
    await cleanupCatalogImages(db);
    await expect(readFile(file(expired.data.url))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(file(attached.data.url))).toBeInstanceOf(Buffer);
    expect(
      await db.catalogApiAsset.findUnique({ where: { id: expired.data.id } }),
    ).toBeNull();
    await expect(upload("expired")).rejects.toMatchObject({
      status: 410,
      code: "ASSET_EXPIRED",
    });
    expect((await upload("attached")).data.id).toBe(attached.data.id);
    expect(await db.catalogApiRequest.count({ where: { tokenId } })).toBe(2);
  });
});
