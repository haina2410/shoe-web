import type { PrismaClient } from "@/generated/prisma/client";
import {
  OrderStatus,
  PaymentDirection,
  type OrderStatus as OrderStatusValue,
} from "@/generated/prisma/enums";
import { canTransitionOrder } from "@/lib/order-status";

export type UpdateOrderStatusErrorCode =
  | "ORDER_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "FULLY_REFUNDED"
  | "STALE_ORDER";

export class UpdateOrderStatusError extends Error {
  constructor(public readonly code: UpdateOrderStatusErrorCode) {
    super(code);
    this.name = "UpdateOrderStatusError";
  }
}

export async function updateOrderStatusCore(
  db: PrismaClient,
  input: { orderId: string; targetStatus: OrderStatusValue },
): Promise<{ orderCode: string; status: OrderStatusValue }> {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "order" WHERE "id" = ${input.orderId} FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new UpdateOrderStatusError("ORDER_NOT_FOUND");
    }

    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, orderCode: true, status: true },
    });
    if (!order) {
      throw new UpdateOrderStatusError("ORDER_NOT_FOUND");
    }
    if (!canTransitionOrder(order.status, input.targetStatus)) {
      throw new UpdateOrderStatusError("INVALID_TRANSITION");
    }

    if (
      order.status === OrderStatus.PAID &&
      input.targetStatus === OrderStatus.FULFILLED
    ) {
      const paymentTotals = await tx.payment.groupBy({
        by: ["direction"],
        where: { orderId: order.id },
        _sum: { amount: true },
      });
      const netReceived = paymentTotals.reduce((net, total) => {
        const amount = total._sum.amount ?? 0;
        return total.direction === PaymentDirection.IN
          ? net + amount
          : net - amount;
      }, 0);

      if (netReceived <= 0) {
        throw new UpdateOrderStatusError("FULLY_REFUNDED");
      }
    }

    const updated = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: input.targetStatus },
    });
    if (updated.count !== 1) {
      throw new UpdateOrderStatusError("STALE_ORDER");
    }

    return { orderCode: order.orderCode, status: input.targetStatus };
  });
}
