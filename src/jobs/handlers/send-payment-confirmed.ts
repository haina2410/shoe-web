import type { PrismaClient } from "@/generated/prisma/client";
import { paymentConfirmedJobSchema } from "@/jobs/queue";
import type { Mailer } from "@/lib/mailer";
import { renderPaymentConfirmedEmail } from "@/emails/payment-confirmed.render";

/** Tra dữ liệu khách từ DB bằng orderCode rồi gửi email xác nhận thanh toán. */
export async function handleSendPaymentConfirmed(
  deps: { db: PrismaClient; mailer: Mailer },
  payload: unknown,
): Promise<void> {
  const { orderCode } = paymentConfirmedJobSchema.parse(payload);
  const order = await deps.db.order.findUnique({
    where: { orderCode },
    include: { items: true },
  });

  if (!order) {
    throw new Error(`Không tìm thấy đơn hàng (orderCode: ${orderCode}).`);
  }

  const orderUrl = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/orders/${order.orderCode}`;
  const { subject, html, text } = await renderPaymentConfirmedEmail({
    orderCode: order.orderCode,
    customerName: order.customerName,
    items: order.items.map((item) => ({
      productName: item.productName,
      size: item.size,
      color: item.color,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    })),
    total: order.total,
    orderUrl,
  });

  await deps.mailer.send({
    to: order.email,
    subject,
    html,
    text,
    idempotencyKey: `payment-confirmed:${order.orderCode}`,
  });
}
