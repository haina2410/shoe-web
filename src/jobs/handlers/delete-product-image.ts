import type { PrismaClient } from "@/generated/prisma/client";
import {
  removeManagedProductImageFile,
  lockProductImageUrls,
} from "@/lib/product-image-files";
import { deleteProductImageJobSchema } from "@/jobs/queue";

export async function handleDeleteProductImage(
  deps: { db: PrismaClient },
  payload: unknown,
): Promise<void> {
  const { url } = deleteProductImageJobSchema.parse(payload);

  await deps.db.$transaction(async (tx) => {
    const initialAsset = await tx.catalogApiAsset.findUnique({
      where: { url },
      select: { tokenId: true },
    });
    if (initialAsset) {
      await tx.$queryRaw`SELECT id FROM catalog_api_token WHERE id = ${initialAsset.tokenId} FOR UPDATE`;
    }
    await lockProductImageUrls(tx, [url]);

    const image = await tx.productImage.findFirst({
      where: { url },
      select: { id: true },
    });
    const asset = await tx.catalogApiAsset.findUnique({
      where: { url },
      select: { id: true },
    });
    if (image) {
      if (asset) {
        await tx.catalogApiAsset.update({
          where: { id: asset.id },
          data: { attachedAt: new Date() },
        });
      }
      return;
    }

    await removeManagedProductImageFile(url);

    if (asset) await tx.catalogApiAsset.delete({ where: { id: asset.id } });
  });
}
