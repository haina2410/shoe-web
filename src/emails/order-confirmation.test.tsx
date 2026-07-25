import { describe, it, expect } from "vitest";
import { renderOrderConfirmationEmail } from "@/emails/order-confirmation.render";
import { formatVnd } from "@/lib/money";
import type { OrderConfirmationEmailProps } from "@/emails/order-confirmation";

function sampleProps(): OrderConfirmationEmailProps {
  return {
    orderCode: "LEAF-AB12CD",
    customerName: "Nguyễn Văn A",
    items: [
      {
        productName: "Giày Chạy Bộ Evergreen",
        size: "42",
        color: "Đen",
        unitPrice: 890000,
        quantity: 1,
      },
      {
        productName: "Giày Sneaker Lá Phong",
        size: "39",
        color: "Trắng",
        unitPrice: 690000,
        quantity: 2,
      },
    ],
    subtotal: 2270000,
    shippingFee: 30000,
    total: 2300000,
    address: {
      province: "TP. Hồ Chí Minh",
      ward: "Phường Bến Nghé",
      addressLine: "12 Nguyễn Huệ",
    },
    qrImageUrl:
      "https://img.vietqr.io/image/MB-0000000000-compact2.png?amount=2300000&addInfo=LEAF-AB12CD&accountName=LEAFSHOES%20VIETNAM",
    bank: {
      bankCode: "MB",
      accountNo: "0000000000",
      accountName: "LEAFSHOES VIETNAM",
    },
    orderUrl: "https://leafshoes.vn/orders/LEAF-AB12CD",
  };
}

describe("renderOrderConfirmationEmail()", () => {
  it("subject đúng định dạng 'Đơn hàng <mã> — leafshoes Việt Nam'", async () => {
    const { subject } = await renderOrderConfirmationEmail(sampleProps());
    expect(subject).toBe("Đơn hàng LEAF-AB12CD — leafshoes Việt Nam");
  });

  it("html chứa mã đơn, tổng tiền đã format, ảnh QR, tên từng sản phẩm", async () => {
    const props = sampleProps();
    const { html } = await renderOrderConfirmationEmail(props);

    expect(html).toContain(props.orderCode);
    expect(html).toContain(formatVnd(props.total));
    expect(html).toContain(formatVnd(props.subtotal));
    expect(html).toContain(formatVnd(props.shippingFee));
    // HTML escape `&` -> `&amp;` trong thuộc tính src ảnh, nên so khớp sau khi escape.
    expect(html).toContain(props.qrImageUrl.replaceAll("&", "&amp;"));
    for (const item of props.items) {
      expect(html).toContain(item.productName);
    }
    expect(html).toContain(props.bank.accountNo);
    expect(html).toContain(props.bank.accountName);
    expect(html).toContain(props.orderUrl);
  });

  it("text (plainText) chứa mã đơn", async () => {
    const { text } = await renderOrderConfirmationEmail(sampleProps());
    expect(text).toContain("LEAF-AB12CD");
    expect(text.length).toBeGreaterThan(0);
  });

  it("không throw với danh sách nhiều sản phẩm", async () => {
    await expect(renderOrderConfirmationEmail(sampleProps())).resolves.toBeDefined();
  });
});
