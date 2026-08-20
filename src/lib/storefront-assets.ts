export const HERO_IMAGE_PATH = "/brand/hero-shoe-temporary.png";

export type CompanyImage = {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
};

export const BRAND_MARK_PATH = "/brand/leafshoes-mark.png";

export const COMPANY_GALLERY_IMAGES = [
  {
    src: "/company/showroom-display.jpg",
    alt: "Khu trưng bày giày dép tại leafshoes Việt Nam",
    caption: "Không gian trưng bày tại xưởng leafshoes",
    width: 1920,
    height: 1080,
  },
  {
    src: "/company/footwear-production.jpg",
    alt: "Những đôi dép đang được hoàn thiện tại xưởng leafshoes",
    caption: "Sản phẩm trong quá trình hoàn thiện",
    width: 1920,
    height: 1440,
  },
  {
    src: "/company/company-opening.jpg",
    alt: "Đại diện leafshoes trong ngày khai trương công ty",
    caption: "Một dấu mốc trong hành trình của leafshoes",
    width: 1920,
    height: 1440,
  },
] as const satisfies readonly CompanyImage[];

export const ABOUT_COMPANY_IMAGES = {
  hero: {
    src: "/company/company-team.jpg",
    alt: "Đại diện leafshoes tại không gian làm việc của công ty",
    caption: "leafshoes Việt Nam tại xưởng ở Đồng Nai",
    width: 1920,
    height: 1440,
  },
  production: COMPANY_GALLERY_IMAGES[1],
  showroom: COMPANY_GALLERY_IMAGES[0],
} as const satisfies Record<
  "hero" | "production" | "showroom",
  CompanyImage
>;

export const SEEDED_PRODUCT_IMAGE_BY_SLUG = {
  "sneaker-la-xanh-co-thap":
    "/products/sneaker-la-xanh-co-thap-1.png",
  "sneaker-do-thi-nang-dong":
    "/products/sneaker-do-thi-nang-dong-1.png",
  "giay-chay-bo-em-nhe": "/products/giay-chay-bo-em-nhe-den-1.png",
  "giay-chay-bo-dia-hinh": "/products/giay-chay-bo-dia-hinh-1.png",
  "sandal-quai-ngang-mua-he":
    "/products/sandal-quai-ngang-mua-he-1.png",
  "sandal-di-bien-chong-truot":
    "/products/sandal-di-bien-chong-truot-1.png",
} as const;
