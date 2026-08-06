import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testPrisma, resetDb } from "@/test/db";
import { createOrderCore } from "@/server/orders";
import type { CreateOrderInput } from "@/lib/validation/checkout";
import type { Mailer, MailMessage } from "@/lib/mailer";
import { handleSendPaymentConfirmed } from "@/jobs/handlers/send-payment-confirmed";

const TEST_PROVINCE = "Hà Nội";

async function makeOrder() {
  const zone = await testPrisma.shippingZone.create({
    data: { name: "Zone Hà Nội", fee: 30000, isDefault: false },
  });
  await testPrisma.provinceZone.create({
    data: { province: TEST_PROVINCE, zoneId: zone.id },
  });
  const category = await testPrisma.category.create({
    data: { name: "Giày Sneaker", slug: "giay-sneaker-payment-email" },
  });
  const product = await testPrisma.product.create({
    data: {
      name: "Giày Chạy Bộ Alpha",
      nameNormalized: "giay chay bo alpha",
      categoryId: category.id,
      basePrice: 300000,
      status: "ACTIVE",
      slug: "giay-payment-email",
      variants: {
        create: [{ size: "40", color: "Đen", sku: "SKU-PAYMENT-EMAIL", stock: 10 }],
      },
    },
    include: { variants: true },
  });
  const input: CreateOrderInput = {
    customerName: "Nguyễn Văn A",
    email: "khach@example.com",
    phone: "0901234567",
    province: TEST_PROVINCE,
    ward: "Phường Ba Đình",
    addressLine: "123 Đường Láng",
    items: [{ variantId: product.variants[0].id, quantity: 2 }],
  };

  return createOrderCore(testPrisma, input, {
    enqueueOrderConfirmation: vi.fn().mockResolvedValue(undefined),
    enqueueZaloOrderCreatedNotifications: vi.fn().mockResolvedValue(undefined),
  });
}

function fakeMailer(): Mailer & { messages: MailMessage[] } {
  const messages: MailMessage[] = [];
  return {
    messages,
    send: vi.fn(async (message: MailMessage) => {
      messages.push(message);
    }),
  };
}

describe("handleSendPaymentConfirmed", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("tra đơn và items từ DB rồi gửi email xác nhận thanh toán cho khách", async () => {
    const order = await makeOrder();
    const mailer = fakeMailer();
    vi.stubEnv("APP_BASE_URL", "https://leafshoes.vn");

    await handleSendPaymentConfirmed(
      { db: testPrisma, mailer },
      { orderCode: order.orderCode },
    );

    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.messages[0].to).toBe(order.email);
    expect(mailer.messages[0].subject).toContain(order.orderCode);
    expect(mailer.messages[0].text.toLocaleLowerCase("vi")).toContain(
      "đã nhận thanh toán",
    );
    expect(mailer.messages[0].text).toContain("630.000");
    expect(mailer.messages[0].text).toContain("Giày Chạy Bộ Alpha");
    expect(mailer.messages[0].idempotencyKey).toBe(
      `payment-confirmed:${order.orderCode}`,
    );
    expect(mailer.messages[0].idempotencyKey).not.toContain(order.email);
    expect(mailer.messages[0].html).toContain(
      `https://leafshoes.vn/orders?orderCode=${order.orderCode}`,
    );
    expect(mailer.messages[0].text).toContain(
      `https://leafshoes.vn/orders?orderCode=${order.orderCode}`,
    );
  });

  it("orderCode không tồn tại → throw và không gửi email", async () => {
    const mailer = fakeMailer();

    await expect(
      handleSendPaymentConfirmed(
        { db: testPrisma, mailer },
        { orderCode: "LEAFKHNGCO" },
      ),
    ).rejects.toThrow();

    expect(mailer.send).not.toHaveBeenCalled();
  });
});
