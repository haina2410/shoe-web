import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, opendir, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { PrismaClient } from "@/generated/prisma/client";
import { CatalogApiError } from "./errors";
import { catalogMutation } from "./mutations";

const maxBytes = 5 * 1024 * 1024;
const maxPixels = 16_000_000;
const storageQuota = 250 * 1024 * 1024;
const imageMimes: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function imagePath(url: string) {
  if (
    !/^\/api\/uploads\/products\/(?:catalog-)?[a-f0-9-]{36}\.webp$/.test(url)
  ) {
    throw new CatalogApiError(
      500,
      "INVALID_ASSET_PATH",
      "Stored image path is invalid",
    );
  }
  return path.join(
    process.env.UPLOAD_DIR ||
      path.join(/* turbopackIgnore: true */ process.cwd(), "uploads"),
    "products",
    path.basename(url),
  );
}

export async function assertCatalogImageAvailable(url: string) {
  try {
    const info = await lstat(imagePath(url));
    if (!info.isFile())
      throw new CatalogApiError(
        422,
        "INVALID_ASSET",
        "Image file is unavailable",
      );
  } catch (error) {
    if (
      error instanceof CatalogApiError ||
      ["ENOENT", "ENOTDIR"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    ) {
      throw new CatalogApiError(
        422,
        "INVALID_ASSET",
        "Image file is unavailable",
      );
    }
    throw error;
  }
}

async function encodeImage(bytes: Buffer, contentType: string) {
  if (!bytes.length)
    throw new CatalogApiError(415, "INVALID_IMAGE", "Image is empty");
  if (bytes.length > maxBytes)
    throw new CatalogApiError(413, "IMAGE_TOO_LARGE", "Image exceeds 5 MiB");
  if (!Object.values(imageMimes).includes(contentType))
    throw new CatalogApiError(415, "INVALID_IMAGE", "Use JPEG, PNG or WebP");
  try {
    const metadata = await sharp(bytes, { limitInputPixels: false }).metadata();
    if (
      !metadata.format ||
      imageMimes[metadata.format] !== contentType ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new CatalogApiError(
        415,
        "INVALID_IMAGE",
        "Image format must match its MIME type and contain one frame",
      );
    }
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 8192 ||
      metadata.height > 8192 ||
      metadata.width * metadata.height > maxPixels
    ) {
      throw new CatalogApiError(
        413,
        "IMAGE_TOO_LARGE",
        "Image exceeds dimension or pixel limits",
      );
    }
    const encoded = await sharp(bytes, {
      limitInputPixels: maxPixels,
      failOn: "warning",
    })
      .rotate()
      .webp()
      .toBuffer();
    if (encoded.length > maxBytes)
      throw new CatalogApiError(
        413,
        "IMAGE_TOO_LARGE",
        "Encoded image exceeds 5 MiB",
      );
    return encoded;
  } catch (error) {
    if (error instanceof CatalogApiError) throw error;
    throw new CatalogApiError(
      415,
      "INVALID_IMAGE",
      "Image could not be decoded",
    );
  }
}

async function removeFile(filename: string) {
  try {
    await unlink(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function uploadCatalogImage(
  db: PrismaClient,
  tokenId: string,
  key: string,
  bytes: Buffer,
  contentType: string,
) {
  const payloadHash = createHash("sha256")
    .update(contentType)
    .update("\0")
    .update(bytes)
    .digest("hex");
  let writtenUrl: string | undefined;
  try {
    const result = await catalogMutation(
      db,
      tokenId,
      "images:write",
      key,
      payloadHash,
      async (tx) => {
        const encoded = await encodeImage(bytes, contentType);
        const used = await tx.catalogApiAsset.aggregate({
          where: { tokenId },
          _sum: { bytes: true },
        });
        if ((used._sum.bytes ?? 0) + encoded.length > storageQuota) {
          throw new CatalogApiError(
            413,
            "STORAGE_QUOTA_EXCEEDED",
            "Credential image storage quota exceeded",
          );
        }
        const url = `/api/uploads/products/catalog-${randomUUID()}.webp`;
        const filename = imagePath(url);
        await mkdir(path.dirname(filename), { recursive: true });
        const handle = await open(filename, "wx");
        writtenUrl = url;
        try {
          await handle.writeFile(encoded);
        } finally {
          await handle.close();
        }
        const asset = await tx.catalogApiAsset.create({
          data: {
            tokenId,
            url,
            bytes: encoded.length,
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        return {
          id: asset.id,
          url: asset.url,
          bytes: asset.bytes,
          expiresAt: asset.expiresAt.toISOString(),
        };
      },
    );
    if (result.replayed) {
      const asset = await db.catalogApiAsset.findUnique({
        where: { id: result.data.id },
      });
      if (!asset || (!asset.attachedAt && asset.expiresAt <= new Date()))
        throw new CatalogApiError(
          410,
          "ASSET_EXPIRED",
          "Uploaded image expired; upload again with a new idempotency key",
        );
      try {
        await assertCatalogImageAvailable(asset.url);
      } catch (error) {
        if (
          !(error instanceof CatalogApiError) ||
          error.code !== "INVALID_ASSET"
        )
          throw error;
        throw new CatalogApiError(
          410,
          "ASSET_EXPIRED",
          "Uploaded image is no longer available; upload again with a new idempotency key",
        );
      }
    }
    return result;
  } catch (error) {
    if (writtenUrl) {
      const url = writtenUrl;
      await db
        .$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM catalog_api_token WHERE id = ${tokenId} FOR UPDATE`;
          if (!(await tx.catalogApiAsset.findUnique({ where: { url } })))
            await removeFile(imagePath(url));
        })
        .catch(() => undefined);
    }
    throw error;
  }
}

export async function cleanupCatalogImages(db: PrismaClient) {
  const expired = await db.catalogApiAsset.findMany({
    where: { attachedAt: null, expiresAt: { lte: new Date() } },
    select: { id: true, tokenId: true },
  });
  let removed = 0;
  for (const candidate of expired) {
    removed += await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM catalog_api_token WHERE id = ${candidate.tokenId} FOR UPDATE`;
      const asset = await tx.catalogApiAsset.findUnique({
        where: { id: candidate.id },
      });
      if (!asset || asset.attachedAt || asset.expiresAt > new Date()) return 0;
      if (
        await tx.productImage.findFirst({
          where: { url: asset.url },
          select: { id: true },
        })
      ) {
        await tx.catalogApiAsset.update({
          where: { id: asset.id },
          data: { attachedAt: new Date() },
        });
        return 0;
      }
      await removeFile(imagePath(asset.url));
      await tx.catalogApiAsset.delete({ where: { id: asset.id } });
      return 1;
    });
  }
  return { removed, orphansRemoved: await cleanupOrphanFiles(db) };
}

async function cleanupOrphanFiles(db: PrismaClient) {
  const directory = path.dirname(
    imagePath(
      "/api/uploads/products/catalog-00000000-0000-0000-0000-000000000000.webp",
    ),
  );
  let entries;
  try {
    entries = await opendir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  const cutoff = Date.now() - 86400000;
  let removed = 0;
  for await (const entry of entries) {
    if (!entry.isFile() || !/^catalog-[a-f0-9-]{36}\.webp$/.test(entry.name))
      continue;
    const url = `/api/uploads/products/${entry.name}`;
    const filename = imagePath(url);
    let info;
    try {
      info = await lstat(filename);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!info.isFile() || info.mtimeMs >= cutoff) continue;
    const asset = await db.catalogApiAsset.findUnique({
      where: { url },
      select: { id: true },
    });
    if (asset) continue;
    const image = await db.productImage.findFirst({
      where: { url },
      select: { id: true },
    });
    if (image) continue;
    await removeFile(filename);
    removed += 1;
  }
  return removed;
}
