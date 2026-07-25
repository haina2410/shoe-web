import { OrderStatus, type PrismaClient } from "@/generated/prisma/client";

const HOUR_IN_MS = 60 * 60 * 1_000;

export async function expireUnpaidOrders(
  { db }: { db: PrismaClient },
  {
    now = new Date(),
    maxAgeHours = 24,
  }: { now?: Date; maxAgeHours?: number } = {},
): Promise<number> {
  const cutoff = new Date(now.getTime() - maxAgeHours * HOUR_IN_MS);
  const result = await db.order.updateMany({
    where: {
      status: OrderStatus.PENDING_PAYMENT,
      createdAt: { lt: cutoff },
    },
    data: { status: OrderStatus.EXPIRED },
  });

  return result.count;
}
