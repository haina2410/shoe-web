import { formatVnd } from "@/lib/money";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import {
  ZALO_NOTIFICATION_RECIPIENTS,
  type ZaloBotClient,
  type ZaloNotificationRecipient,
} from "@/lib/zalo-bot";
import { zaloOrderCreatedJobSchema } from "@/jobs/queue";

type ZaloOrderCreatedOrder = {
  id: string;
  orderCode: string;
  customerName: string;
  phone: string;
  total: number;
  status: string;
};

type ZaloOrderReader = {
  order: {
    findUnique(args: {
      where: { orderCode: string };
      select: {
        id: true;
        orderCode: true;
        customerName: true;
        phone: true;
        total: true;
        status: true;
      };
    }): Promise<ZaloOrderCreatedOrder | null>;
  };
};

function escapeMarkdown(value: string): string {
  return value.replace(/([_\[\]()~`*>#+\-=|{}.!])/g, "\\$1");
}

export function formatZaloOrderCreatedMessage(
  order: ZaloOrderCreatedOrder,
  appBaseUrl: string,
): string {
  const baseUrl = appBaseUrl.replace(/\/+$/, "");
  const status = ORDER_STATUS_LABEL[order.status as keyof typeof ORDER_STATUS_LABEL];

  return [
    `*Đơn hàng mới: ${escapeMarkdown(order.orderCode)}*`,
    `Khách: ${escapeMarkdown(order.customerName)} · ${escapeMarkdown(order.phone)}`,
    `Tổng: ${formatVnd(order.total)} · ${status}`,
    `Chi tiết: ${baseUrl}/admin/orders/${order.id}`,
  ].join("\n");
}

export async function handleSendZaloOrderCreated(
  deps: {
    db: ZaloOrderReader;
    bot: Pick<ZaloBotClient, "sendMessage">;
    recipients?: readonly ZaloNotificationRecipient[];
  },
  payload: unknown,
): Promise<void> {
  const { orderCode, recipientKey } = zaloOrderCreatedJobSchema.parse(payload);
  const recipient = (deps.recipients ?? ZALO_NOTIFICATION_RECIPIENTS).find(
    (candidate) => candidate.key === recipientKey,
  );
  if (!recipient) {
    throw new Error(`Không tìm thấy người nhận thông báo Zalo: ${recipientKey}.`);
  }

  const order = await deps.db.order.findUnique({
    where: { orderCode },
    select: {
      id: true,
      orderCode: true,
      customerName: true,
      phone: true,
      total: true,
      status: true,
    },
  });
  if (!order) {
    throw new Error(`Không tìm thấy đơn hàng (orderCode: ${orderCode}).`);
  }

  await deps.bot.sendMessage({
    chatId: recipient.chatId,
    text: formatZaloOrderCreatedMessage(order, process.env.APP_BASE_URL ?? "http://localhost:3000"),
    parseMode: "markdown",
  });
}
