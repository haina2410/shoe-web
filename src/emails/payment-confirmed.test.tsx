import { describe, expect, it } from "vitest";
import { renderPaymentConfirmedEmail } from "@/emails/payment-confirmed.render";

describe("renderPaymentConfirmedEmail", () => {
  it("thông báo đã nhận thanh toán với mã đơn và tổng tiền đã định dạng", async () => {
    const rendered = await renderPaymentConfirmedEmail({
      orderCode: "LEAF-ABC123",
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
      orderUrl: "https://leafshoes.vn/orders/LEAF-ABC123",
    });

    expect(rendered.subject).toContain("LEAF-ABC123");
    expect(rendered.html).toContain("LEAF-ABC123");
    expect(rendered.text).toContain("LEAF-ABC123");
    expect(rendered.html).toContain("630.000");
    expect(rendered.text).toContain("630.000");
    expect(rendered.text.toLocaleLowerCase("vi")).toContain("đã nhận thanh toán");
  });
});
