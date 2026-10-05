// @vitest-environment node
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertManagedProductImageAvailable,
  isManagedProductImageUrl,
  productImageFilePath,
  lockProductImageUrls,
} from "@/lib/product-image-files";

const uuid = "123e4567-e89b-12d3-a456-426614174000";
let directory = "";

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = "";
  vi.unstubAllEnvs();
});

describe("managed product image URLs", () => {
  it("accepts only safe upload URL shapes", () => {
    expect(isManagedProductImageUrl(`/api/uploads/products/${uuid}.jpg`)).toBe(true);
    expect(isManagedProductImageUrl(`/api/uploads/products/catalog-${uuid}.webp`)).toBe(true);
    expect(isManagedProductImageUrl("/uploads/shoe.webp")).toBe(false);
    expect(isManagedProductImageUrl("https://cdn.example/shoe.webp")).toBe(false);
    expect(isManagedProductImageUrl(`/api/uploads/products/../${uuid}.webp`)).toBe(false);
    expect(isManagedProductImageUrl(`/api/uploads/products/${uuid}.svg`)).toBe(false);
  });

  it("resolves a managed URL inside the configured uploads directory", () => {
    vi.stubEnv("UPLOAD_DIR", "/tmp/product-uploads");
    expect(productImageFilePath(`/api/uploads/products/${uuid}.png`)).toBe(
      path.join("/tmp/product-uploads", "products", `${uuid}.png`),
    );
  });

  it("accepts a regular file and rejects missing files and symlink targets", async () => {
    directory = await mkdtemp(path.join(tmpdir(), "product-images-"));
    vi.stubEnv("UPLOAD_DIR", directory);
    const folder = path.join(directory, "products");
    await mkdir(folder);
    const url = `/api/uploads/products/${uuid}.webp`;
    const filename = path.join(folder, `${uuid}.webp`);
    await writeFile(filename, "image");
    await expect(assertManagedProductImageAvailable(url)).resolves.toBeUndefined();
    await rm(filename);
    await expect(assertManagedProductImageAvailable(url)).rejects.toThrow();
    const target = path.join(directory, "outside.webp");
    await writeFile(target, "image");
    await symlink(target, filename);
    await expect(assertManagedProductImageAvailable(url)).rejects.toThrow();
  });

  it("rejects a symlinked products directory", async () => {
    directory = await mkdtemp(path.join(tmpdir(), "product-images-"));
    vi.stubEnv("UPLOAD_DIR", directory);
    const outside = await mkdtemp(path.join(tmpdir(), "product-images-outside-"));
    const url = `/api/uploads/products/${uuid}.webp`;
    const target = path.join(outside, `${uuid}.webp`);
    await writeFile(target, "image");
    await symlink(outside, path.join(directory, "products"));
    await expect(assertManagedProductImageAvailable(url)).rejects.toThrow();
    await expect(writeFile(target, "safe")).resolves.toBeUndefined();
    await rm(outside, { recursive: true, force: true });
  });

  it("locks distinct managed URLs in sorted order", async () => {
    const queries: unknown[][] = [];
    const tx = {
      $queryRaw: async (...args: unknown[]) => {
        queries.push(args);
      },
    };
    await lockProductImageUrls(tx as never, [
      `/api/uploads/products/${uuid}.webp`,
      `/api/uploads/products/023e4567-e89b-12d3-a456-426614174000.webp`,
      `/api/uploads/products/${uuid}.webp`,
    ]);
    expect(queries).toHaveLength(2);
  });
});
