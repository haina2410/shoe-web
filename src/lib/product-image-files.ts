import { lstat, unlink } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@/generated/prisma/client";
import { isManagedProductImageUrl } from "@/lib/product-image-url";

export { isManagedProductImageUrl } from "@/lib/product-image-url";

export class ManagedProductImageUnavailableError extends Error {
  constructor(public readonly missing: boolean) {
    super("Managed product image is unavailable");
    this.name = "ManagedProductImageUnavailableError";
  }
}

export function productImageFilePath(url: string): string {
  if (!isManagedProductImageUrl(url)) {
    throw new Error("Invalid managed product image URL");
  }
  const root =
    process.env.UPLOAD_DIR ||
    path.join(/* turbopackIgnore: true */ process.cwd(), "uploads");
  return path.join(root, "products", path.basename(url));
}

export async function assertManagedProductImageAvailable(url: string): Promise<void> {
  const filename = productImageFilePath(url);
  const root = path.dirname(path.dirname(filename));
  const productsDirectory = path.dirname(filename);
  let rootInfo;
  let productsInfo;
  let fileInfo;
  try {
    rootInfo = await lstat(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ManagedProductImageUnavailableError(true);
    }
    throw error;
  }
  if (!rootInfo.isDirectory()) throw new ManagedProductImageUnavailableError(false);
  try {
    productsInfo = await lstat(productsDirectory);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new ManagedProductImageUnavailableError(true);
    throw error;
  }
  if (!productsInfo.isDirectory()) throw new ManagedProductImageUnavailableError(false);
  try {
    fileInfo = await lstat(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ManagedProductImageUnavailableError(true);
    }
    throw error;
  }
  if (!fileInfo.isFile()) {
    throw new ManagedProductImageUnavailableError(false);
  }
}

export async function lockProductImageUrls(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  urls: readonly string[],
): Promise<void> {
  const managedUrls = [...new Set(urls.filter(isManagedProductImageUrl))].sort();
  for (const url of managedUrls) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${url}, 0))::text`;
  }
}

export async function removeManagedProductImageFile(url: string): Promise<void> {
  const filename = productImageFilePath(url);
  try {
    await assertManagedProductImageAvailable(url);
    await unlink(filename);
  } catch (error) {
    if (error instanceof ManagedProductImageUnavailableError && error.missing) return;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}
