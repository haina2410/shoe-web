import { describe, expect, it } from "vitest";
import { renderPaymentConfirmedEmail } from "@/emails/payment-confirmed.render";

describe("renderPaymentConfirmedEmail", () => {
  it("thông báo đã nhận thanh toán với mã đơn và tổng tiền đã định dạng", async () => {
    const rendered = await renderPaymentConfirmedEmail({
      orderCode: "LEAFABC123",
      customerName: "Nguyễn Văn A",
      items: [
        {
          productName: "Giày Chạy Bộ Alpha",
          size: "40",
          color: "Đen",
          unitPrice: 300000,
          quantity: 2,
        },
      ],
      total: 630000,
      orderUrl: "https://leafshoes.vn/orders/LEAFABC123",
    });

    expect(rendered.subject).toContain("LEAFABC123");
    expect(rendered.html).toContain("LEAFABC123");
    expect(rendered.text).toContain("LEAFABC123");
    expect(rendered.html).toContain("630.000");
    expect(rendered.text).toContain("630.000");
    expect(rendered.text.toLocaleLowerCase("vi")).toContain("đã nhận thanh toán");
  });
});
