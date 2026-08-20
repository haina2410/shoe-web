import type { MetadataRoute } from "next";
import { ProductStatus } from "@/generated/prisma/enums";
import { POLICY_PAGE_LIST } from "@/lib/policy-content";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const storefrontPaths = [
  "",
  "/products",
  "/gioi-thieu",
  "/nha-may",
  "/chi-nhanh",
  ...POLICY_PAGE_LIST.map((page) => page.href),
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const products = await prisma.product.findMany({
    where: { status: ProductStatus.ACTIVE },
    select: { slug: true, updatedAt: true },
    orderBy: { slug: "asc" },
  });

  return [
    ...storefrontPaths.map((path) => ({ url: `${baseUrl}${path}` })),
    ...products.map((product) => ({
      url: `${baseUrl}/products/${product.slug}`,
      lastModified: product.updatedAt,
    })),
  ];
}
