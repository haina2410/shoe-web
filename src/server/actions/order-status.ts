"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrderStatus } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import {
  UpdateOrderStatusError,
  updateOrderStatusCore,
  type UpdateOrderStatusErrorCode,
} from "@/server/orders/update-status";

export type UpdateOrderStatusActionResult =
  | { ok: true; status: OrderStatus }
  | { ok: false; error: string };

const orderIdSchema = z.string().trim().cuid();
const targetStatusSchema = z.enum(OrderStatus);

const businessErrorMessage: Record<UpdateOrderStatusErrorCode, string> = {
  ORDER_NOT_FOUND: "Không tìm thấy đơn hàng.",
  INVALID_TRANSITION: "Không thể chuyển đơn hàng sang trạng thái này.",
  FULLY_REFUNDED: "Đơn hàng đã được hoàn tiền toàn bộ.",
  STALE_ORDER:
    "Trạng thái đơn hàng đã thay đổi. Vui lòng tải lại trang và thử lại.",
};

const genericError =
  "Không thể cập nhật trạng thái đơn hàng lúc này. Vui lòng thử lại.";

export async function updateOrderStatusAction(
  orderId: string,
  targetStatus: string,
): Promise<UpdateOrderStatusActionResult> {
  await requireAdmin();

  const parsedOrderId = orderIdSchema.safeParse(orderId);
  if (!parsedOrderId.success) {
    return { ok: false, error: "Mã đơn hàng không hợp lệ." };
  }

  const parsedTargetStatus = targetStatusSchema.safeParse(targetStatus);
  if (!parsedTargetStatus.success) {
    return { ok: false, error: "Trạng thái đơn hàng không hợp lệ." };
  }

  let result: Awaited<ReturnType<typeof updateOrderStatusCore>>;
  try {
    result = await updateOrderStatusCore(prisma, {
      orderId: parsedOrderId.data,
      targetStatus: parsedTargetStatus.data,
    });
  } catch (error: unknown) {
    if (error instanceof UpdateOrderStatusError) {
      return { ok: false, error: businessErrorMessage[error.code] };
    }

    console.error("[orders] operation=update-status category=infrastructure");
    return { ok: false, error: genericError };
  }

  const paths = [
    "/admin/orders",
    `/admin/orders/${parsedOrderId.data}`,
    `/orders/${result.orderCode}`,
  ];
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch {
      console.error(
        "[orders] operation=update-status-revalidate category=infrastructure",
      );
    }
  }

  return { ok: true, status: result.status };
}
