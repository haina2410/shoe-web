import type { PrismaClient } from "@/generated/prisma/client";

export class HomeHeroIneligibleError extends Error {
  constructor() {
    super("HOME_HERO_INELIGIBLE");
  }
}

export async function setHomeHeroProduct(
  db: PrismaClient,
  productId: string | null,
) {
  if (productId !== null) {
    const eligible = await db.product.findFirst({
      where: {
        id: productId,
        status: "ACTIVE",
        imageSets: { some: { images: { some: {} } } },
      },
      select: { id: true },
    });
    if (!eligible) throw new HomeHeroIneligibleError();
  }

  return db.storefrontSetting.update({
    where: { id: 1 },
    data: { heroProductId: productId },
  });
}
