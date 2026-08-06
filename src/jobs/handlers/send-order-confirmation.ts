import type { PrismaClient } from "@/generated/prisma/client";
import { orderConfirmationJobSchema } from "@/jobs/queue";
import type { Mailer } from "@/lib/mailer";
import { renderOrderConfirmationEmail } from "@/emails/order-confirmation.render";
import { buildOrderLookupUrl } from "@/lib/order-url";
import { buildVietQrImageUrl, vietQrConfigFromEnv } from "@/lib/vietqr";

/**
 * `src/jobs/handlers/send-order-confirmation.ts` — xử lý job
 * `send-order-confirmation` (Task 2, `src/jobs/queue.ts`): tra `Order` theo
 * `orderCode` trong payload, render email, rồi gửi qua `Mailer` (tiêm từ
 * ngoài — worker thật dùng `mailerFromEnv()`, test dùng fake mailer).
 *
 * Payload job CHỈ chứa `orderCode` (không PII) — mọi dữ liệu khách hàng
 * (email/tên/địa chỉ) đọc thẳng từ DB tại thời điểm xử lý, KHÔNG log ra
 * console (kể cả khi lỗi).
 *
 * Không tìm thấy order → THROW (không nuốt lỗi âm thầm) để pg-boss coi job
 * là fail và tự retry theo `retryLimit` mặc định.
 */
export async function handleSendOrderConfirmation(
  deps: { db: PrismaClient; mailer: Mailer },
  payload: unknown,
): Promise<void> {
  const { orderCode } = orderConfirmationJobSchema.parse(payload);

  const order = await deps.db.order.findUnique({
    where: { orderCode },
    include: { items: true },
  });

  if (!order) {
    throw new Error(`Không tìm thấy đơn hàng (orderCode: ${orderCode}).`);
  }

  const qrConfig = vietQrConfigFromEnv();
  const qrImageUrl = buildVietQrImageUrl({
    ...qrConfig,
    amount: order.total,
    addInfo: order.orderCode,
  });

  const orderUrl = buildOrderLookupUrl(
    process.env.APP_BASE_URL ?? "http://localhost:3000",
    order.orderCode,
  );

  const { subject, html, text } = await renderOrderConfirmationEmail({
    orderCode: order.orderCode,
    customerName: order.customerName,
    items: order.items.map((item) => ({
      productName: item.productName,
      size: item.size,
      color: item.color,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    })),
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    total: order.total,
    address: {
      province: order.province,
      ward: order.ward,
      addressLine: order.addressLine,
    },
    qrImageUrl,
    bank: {
      bankCode: qrConfig.bankCode,
      accountNo: qrConfig.accountNo,
      accountName: qrConfig.accountName,
    },
    orderUrl,
    contactEmail: process.env.MAIL_REPLY_TO,
  });

  await deps.mailer.send({ to: order.email, subject, html, text });
}
