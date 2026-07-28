import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HERO_IMAGE_PATH,
  SEEDED_PRODUCT_IMAGE_BY_SLUG,
} from "./storefront-assets";

const SEEDED_PRODUCT_SLUGS = [
  "sneaker-la-xanh-co-thap",
  "sneaker-do-thi-nang-dong",
  "giay-chay-bo-em-nhe",
  "giay-chay-bo-dia-hinh",
  "sandal-quai-ngang-mua-he",
  "sandal-di-bien-chong-truot",
] as const;

const toPublicFile = (publicUrl: string) =>
  path.join(process.cwd(), "public", publicUrl.replace(/^\//, ""));

describe("storefront assets", () => {
  it("maps every seeded product slug to an image", () => {
    expect(Object.keys(SEEDED_PRODUCT_IMAGE_BY_SLUG)).toEqual(
      SEEDED_PRODUCT_SLUGS,
    );
  });

  it("keeps every configured storefront image in public", () => {
    expect(existsSync(toPublicFile(HERO_IMAGE_PATH))).toBe(true);

    for (const imageUrl of Object.values(SEEDED_PRODUCT_IMAGE_BY_SLUG)) {
      expect(existsSync(toPublicFile(imageUrl))).toBe(true);
    }
  });
});
