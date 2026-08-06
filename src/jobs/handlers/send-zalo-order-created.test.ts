import { describe, expect, it, vi } from "vitest";
import {
  formatZaloOrderCreatedMessage,
  handleSendZaloOrderCreated,
} from "@/jobs/handlers/send-zalo-order-created";

const order = {
  id: "order-123",
  orderCode: "LEAFABC123",
  customerName: "Nguyễn Văn A",
  phone: "0901234567",
  total: 1250000,
  status: "PENDING_PAYMENT",
  email: "customer@example.com",
  province: "Hà Nội",
  ward: "Phường Ba Đình",
  addressLine: "123 Đường Láng",
  note: "Gọi trước khi giao",
  items: [{ productName: "Giày chạy bộ" }],
};

function createDeps() {
  const findUnique = vi.fn().mockResolvedValue(order);
  const sendMessage = vi.fn().mockResolvedValue(undefined);

  return {
    findUnique,
    sendMessage,
    deps: {
      db: { order: { findUnique } },
      bot: { sendMessage },
      recipients: [{ key: "staff-hanoi", chatId: "1000001" }],
    },
  };
}

describe("formatZaloOrderCreatedMessage", () => {
  it("formats exactly four compact Markdown lines with Vietnamese VND and the admin order URL", () => {
    expect(
      formatZaloOrderCreatedMessage(order, "https://leafshoes.vn/"),
    ).toBe(
      "*Đơn hàng mới: LEAFABC123*\n" +
        "Khách: Nguyễn Văn A · 0901234567\n" +
        "Tổng: 1.250.000 ₫ · Chờ thanh toán\n" +
        "Chi tiết: https://leafshoes.vn/admin/orders/order-123",
    );
  });

  it("escapes dynamic Markdown text and omits customer data outside the compact boundary", () => {
    const privateOrder = {
      ...order,
      orderCode: "LEAF_[()]",
      customerName: "A_[B](C)*",
      phone: "0901_234*567",
      email: "private@example.com",
      addressLine: "Private address",
      note: "Private note",
      items: [{ productName: "Private item" }],
    };
    const message = formatZaloOrderCreatedMessage(privateOrder, "https://leafshoes.vn");

    expect(message).toContain("LEAF\\_\\[\\(\\)\\]");
    expect(message).toContain("A\\_\\[B\\]\\(C\\)\\*");
    expect(message).toContain("0901\\_234\\*567");
    expect(message).not.toContain("private@example.com");
    expect(message).not.toContain("Private address");
    expect(message).not.toContain("Private note");
    expect(message).not.toContain("Private item");
  });
});

describe("handleSendZaloOrderCreated", () => {
  it("resolves the recipient key and sends the compact message through Markdown mode", async () => {
    const { deps, findUnique, sendMessage } = createDeps();

    await handleSendZaloOrderCreated(deps, {
      orderCode: "LEAFABC123",
      recipientKey: "staff-hanoi",
    });

    expect(findUnique).toHaveBeenCalledWith({
      where: { orderCode: "LEAFABC123" },
      select: {
        id: true,
        orderCode: true,
        customerName: true,
        phone: true,
        total: true,
        status: true,
      },
    });
    expect(sendMessage).toHaveBeenCalledWith({
      chatId: "1000001",
      text: expect.stringContaining("LEAFABC123"),
      parseMode: "markdown",
    });
  });

  it("rejects an unknown recipient key without sending a message", async () => {
    const { deps, sendMessage } = createDeps();

    await expect(
      handleSendZaloOrderCreated(deps, {
        orderCode: "LEAFABC123",
        recipientKey: "removed-recipient",
      }),
    ).rejects.toThrow(/removed-recipient/);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("propagates a Bot API failure so pg-boss retries the job", async () => {
    const { deps, sendMessage } = createDeps();
    sendMessage.mockRejectedValue(new Error("Bot API unavailable"));

    await expect(
      handleSendZaloOrderCreated(deps, {
        orderCode: "LEAFABC123",
        recipientKey: "staff-hanoi",
      }),
    ).rejects.toThrow("Bot API unavailable");
  });
});
