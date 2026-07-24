import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { SHIPPING_ZONES, PROVINCE_ZONES } from "./data/provinces";
import { auth } from "../src/lib/auth";
import { normalizeText } from "../src/lib/normalize";

type Db = PrismaClient;

type VariantSeed = {
  size: string;
  color: string;
  sku: string;
  stock: number;
  priceOverride?: number;
};

type ProductSeed = {
  name: string;
  slug: string;
  description: string;
  basePrice: number;
  categorySlug: string;
  images: string[];
  variants: VariantSeed[];
};

const CATEGORIES = [
  { name: "Giày Sneaker", slug: "giay-sneaker" },
  { name: "Giày Chạy Bộ", slug: "giay-chay-bo" },
  { name: "Giày Sandal", slug: "giay-sandal" },
] as const;

const SIZES = ["39", "40", "41", "42"];
const COLORS = ["Đen", "Trắng"];

function makeVariants(skuPrefix: string): VariantSeed[] {
  const variants: VariantSeed[] = [];
  for (const size of SIZES) {
    for (const color of COLORS) {
      variants.push({
        size,
        color,
        sku: `${skuPrefix}-${size}-${color === "Đen" ? "DEN" : "TRA"}`,
        stock: 20,
      });
    }
  }
  return variants;
}

const PRODUCTS: ProductSeed[] = [
  {
    name: "Sneaker Lá Xanh Cổ Thấp",
    slug: "sneaker-la-xanh-co-thap",
    description: "Sneaker cổ thấp, chất liệu vải canvas thoáng khí.",
    basePrice: 890000,
    categorySlug: "giay-sneaker",
    images: ["/products/sneaker-la-xanh-co-thap-1.jpg"],
    variants: makeVariants("SNK-LX"),
  },
  {
    name: "Sneaker Đô Thị Năng Động",
    slug: "sneaker-do-thi-nang-dong",
    description: "Thiết kế trẻ trung, phù hợp đi phố mỗi ngày.",
    basePrice: 950000,
    categorySlug: "giay-sneaker",
    images: ["/products/sneaker-do-thi-nang-dong-1.jpg"],
    variants: makeVariants("SNK-DT"),
  },
  {
    name: "Giày Chạy Bộ Êm Nhẹ",
    slug: "giay-chay-bo-em-nhe",
    description: "Đệm êm, trọng lượng nhẹ, phù hợp chạy đường dài.",
    basePrice: 1250000,
    categorySlug: "giay-chay-bo",
    images: ["/products/giay-chay-bo-em-nhe-1.jpg"],
    variants: makeVariants("RUN-EN"),
  },
  {
    name: "Giày Chạy Bộ Địa Hình",
    slug: "giay-chay-bo-dia-hinh",
    description: "Đế bám tốt, phù hợp chạy trail và địa hình gồ ghề.",
    basePrice: 1450000,
    categorySlug: "giay-chay-bo",
    images: ["/products/giay-chay-bo-dia-hinh-1.jpg"],
    variants: makeVariants("RUN-DH"),
  },
  {
    name: "Sandal Quai Ngang Mùa Hè",
    slug: "sandal-quai-ngang-mua-he",
    description: "Sandal thoáng mát, quai ngang chắc chắn cho ngày hè.",
    basePrice: 450000,
    categorySlug: "giay-sandal",
    images: ["/products/sandal-quai-ngang-mua-he-1.jpg"],
    variants: makeVariants("SDL-QN"),
  },
  {
    name: "Sandal Đi Biển Chống Trượt",
    slug: "sandal-di-bien-chong-truot",
    description: "Đế chống trượt, phù hợp đi biển và dã ngoại.",
    basePrice: 400000,
    categorySlug: "giay-sandal",
    images: ["/products/sandal-di-bien-chong-truot-1.jpg"],
    variants: makeVariants("SDL-DB"),
  },
];

export async function seed(prisma: Db) {
  // 1) Zones (upsert theo name — đã unique) + provinces
  for (const z of SHIPPING_ZONES) {
    await prisma.shippingZone.upsert({
      where: { name: z.name },
      update: { fee: z.fee, isDefault: z.isDefault },
      create: { name: z.name, fee: z.fee, isDefault: z.isDefault },
    });
  }
  for (const pz of PROVINCE_ZONES) {
    const zone = await prisma.shippingZone.findUniqueOrThrow({
      where: { name: pz.zone },
    });
    await prisma.provinceZone.upsert({
      where: { province: pz.province },
      update: { zoneId: zone.id },
      create: { province: pz.province, zoneId: zone.id },
    });
  }

  // 2) Categories (upsert theo slug)
  const categoryIdBySlug = new Map<string, string>();
  for (const c of CATEGORIES) {
    const category = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name },
      create: { name: c.name, slug: c.slug },
    });
    categoryIdBySlug.set(c.slug, category.id);
  }

  // 3) Products (upsert theo slug) + images + Variants (upsert theo sku)
  for (const p of PRODUCTS) {
    const categoryId = categoryIdBySlug.get(p.categorySlug);
    if (!categoryId) {
      throw new Error(`Không tìm thấy category cho slug: ${p.categorySlug}`);
    }
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name,
        nameNormalized: normalizeText(p.name),
        description: p.description,
        basePrice: p.basePrice,
        categoryId,
        status: "ACTIVE",
      },
      create: {
        name: p.name,
        nameNormalized: normalizeText(p.name),
        slug: p.slug,
        description: p.description,
        basePrice: p.basePrice,
        categoryId,
        status: "ACTIVE",
      },
    });

    // Ảnh sản phẩm: xoá & tạo lại theo product để idempotent (không có khoá tự nhiên riêng).
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    for (const [position, url] of p.images.entries()) {
      await prisma.productImage.create({
        data: { productId: product.id, url, position },
      });
    }

    for (const v of p.variants) {
      await prisma.variant.upsert({
        where: { sku: v.sku },
        update: {
          productId: product.id,
          size: v.size,
          color: v.color,
          stock: v.stock,
          priceOverride: v.priceOverride ?? null,
        },
        create: {
          productId: product.id,
          size: v.size,
          color: v.color,
          sku: v.sku,
          stock: v.stock,
          priceOverride: v.priceOverride ?? null,
        },
      });
    }
  }
}

type AdminSeedUser = {
  email: string;
  password: string;
  name: string;
  role: "owner" | "staff";
};

/**
 * Seed 2 tài khoản quản trị mặc định cho môi trường dev (owner + staff).
 *
 * KHÔNG nằm trong `seed(prisma)` testable: `seed.test.ts` gọi `seed(testPrisma)`
 * trỏ vào DB test, nhưng `auth.api.createUser` luôn đi qua `auth` toàn cục →
 * `prisma` toàn cục (`DATABASE_URL` dev) — nếu gộp vào đây, chạy test sẽ vô
 * tình tạo user trên DB dev. Vì vậy hàm này chỉ được gọi từ CLI entry bên
 * dưới (chạy trên DB dev qua `npx prisma db seed`), không được test tự động
 * gọi tới.
 *
 * Idempotent: bỏ qua nếu email đã tồn tại (không throw, không tạo trùng).
 */
async function seedAdminUsers(prisma: Db) {
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  const staffPassword = process.env.SEED_STAFF_PASSWORD;
  if (!ownerPassword || !staffPassword) {
    throw new Error(
      "Thiếu SEED_OWNER_PASSWORD / SEED_STAFF_PASSWORD trong .env"
    );
  }

  const users: AdminSeedUser[] = [
    {
      email: process.env.SEED_OWNER_EMAIL || "owner@leafshoes.local",
      password: ownerPassword,
      name: "Chủ cửa hàng",
      role: "owner",
    },
    {
      email: process.env.SEED_STAFF_EMAIL || "staff@leafshoes.local",
      password: staffPassword,
      name: "Nhân viên",
      role: "staff",
    },
  ];

  for (const u of users) {
    const existing = await prisma.user.findUnique({
      where: { email: u.email },
    });
    if (existing) {
      console.log(`[seed:admin] Bỏ qua (đã tồn tại): role=${u.role}`);
      continue;
    }
    await auth.api.createUser({
      body: { email: u.email, password: u.password, name: u.name, role: u.role },
    });
    console.log(`[seed:admin] Đã tạo tài khoản mới: role=${u.role}`);
  }
}

if (process.argv[1] && process.argv[1].includes("seed")) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  seed(prisma)
    .then(() => seedAdminUsers(prisma))
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
