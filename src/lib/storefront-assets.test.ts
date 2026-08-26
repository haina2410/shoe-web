import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ABOUT_COMPANY_IMAGES,
  BRAND_MARK_PATH,
  COMPANY_GALLERY_IMAGES,
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
  it("cung cấp bộ nhận diện và ảnh công ty có nội dung thay thế cùng kích thước", () => {
    expect(BRAND_MARK_PATH).toBe("/brand/leafshoes-mark.png");
    expect(COMPANY_GALLERY_IMAGES).toHaveLength(2);

    for (const image of COMPANY_GALLERY_IMAGES) {
      expect(image.alt).not.toBe("");
      expect(image.width).toBeGreaterThan(0);
      expect(image.height).toBeGreaterThan(0);
    }

    expect(ABOUT_COMPANY_IMAGES).toEqual({
      production: COMPANY_GALLERY_IMAGES[1],
      showroom: COMPANY_GALLERY_IMAGES[0],
    });
  });

  it("giữ mọi ảnh thương hiệu và công ty tại đường dẫn đã công bố", () => {
    const publicImages = [
      BRAND_MARK_PATH,
      ...COMPANY_GALLERY_IMAGES.map((image) => image.src),
      ...Object.values(ABOUT_COMPANY_IMAGES).map((image) => image.src),
    ];

    for (const imageUrl of publicImages) {
      expect(existsSync(toPublicFile(imageUrl))).toBe(true);
    }

    expect(existsSync(path.join(process.cwd(), "src/app/icon.png"))).toBe(true);
    expect(existsSync(path.join(process.cwd(), "src/app/apple-icon.png"))).toBe(
      true,
    );
  });

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
