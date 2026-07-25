import { describe, it, expect, beforeEach, vi } from "vitest";
import { testPrisma, resetDb } from "@/test/db";
import { createOrderCore } from "@/server/orders";
import type { CreateOrderInput } from "@/lib/validation/checkout";
import type { Mailer, MailMessage } from "@/lib/mailer";
import { handleSendOrderConfirmation } from "@/jobs/handlers/send-order-confirmation";

/**
 * `src/jobs/handlers/send-order-confirmation.integration.test.ts` —
 * integration test cho `handleSendOrderConfirmation` (`src/jobs/handlers/
 * send-order-confirmation.ts`), DB thật (`testPrisma`, xem `src/test/db.ts`)
 * + **fake mailer** (không mạng, không gửi email thật).
 *
 * Fixture đơn hàng đi qua `createOrderCore` (Ngày 5, `src/server/orders.ts`)
 * — cùng cách dựng fixture với `src/server/orders.integration.test.ts`
 * (category → product → variant, + 1 shippingZone/provinceZone).
 */

const ZONE_FEE = 30000;
const TEST_PROVINCE = "Hà Nội";

async function makeShippingZone(fee = ZONE_FEE, province = TEST_PROVINCE) {
  const zone = await testPrisma.shippingZone.create({
    data: { name: `Zone ${province}-${Math.random().toString(36).slice(2, 8)}`, fee, isDefault: false },
  });
  await testPrisma.provinceZone.create({
    data: { province, zoneId: zone.id },
  });
  return zone;
}

async function makeCategory(name = "Giày Sneaker", slug = "giay-sneaker") {
  return testPrisma.category.create({ data: { name, slug } });
}

async function makeProductWithVariant(opts: { categoryId: string }) {
  const product = await testPrisma.product.create({
    data: {
      name: "Giày Chạy Bộ Alpha",
      nameNormalized: "giay chay bo alpha",
      categoryId: opts.categoryId,
      basePrice: 300000,
      status: "ACTIVE",
      slug: "giay-" + Math.random().toString(36).slice(2, 10),
      variants: {
        create: [
          {
            size: "40",
            color: "Đen",
            sku: "SKU-" + Math.random().toString(36).slice(2, 10),
            priceOverride: null,
            stock: 10,
          },
        ],
      },
    },
    include: { variants: true },
  });
  return { product, variant: product.variants[0] };
}

function baseInput(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    customerName: "Nguyễn Văn A",
    email: "khach@example.com",
    phone: "0901234567",
    province: TEST_PROVINCE,
    ward: "Phường Ba Đình",
    addressLine: "123 Đường Láng",
    items: [],
    ...overrides,
  };
}

/** Fake `Mailer` — ghi lại message gửi đi, không gọi mạng. */
function fakeMailer(): Mailer & { messages: MailMessage[] } {
  const messages: MailMessage[] = [];
  return {
    messages,
    send: vi.fn(async (message: MailMessage) => {
      messages.push(message);
    }),
  };
}

async function makeOrder() {
  await makeShippingZone();
  const category = await makeCategory();
  const { variant } = await makeProductWithVariant({ categoryId: category.id });
  // F1 (final review Ngày 6): KHÔNG dùng deps mặc định của `createOrderCore`
  // (gọi `enqueueOrderConfirmation` thật → `getBoss()` → DATABASE_URL) — file
  // này chỉ test `handleSendOrderConfirmation` gọi trực tiếp, không cần job
  // thật nào được enqueue.
  return createOrderCore(
    testPrisma,
    baseInput({ items: [{ variantId: variant.id, quantity: 2 }] }),
    { enqueueOrderConfirmation: vi.fn().mockResolvedValue(undefined) },
  );
}

describe("handleSendOrderConfirmation", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("có order thật trong DB → gọi mailer.send đúng 1 lần với to/html đúng (orderCode, tổng tiền, QR addInfo=orderCode)", async () => {
    const order = await makeOrder();
    const mailer = fakeMailer();

    await handleSendOrderConfirmation(
      { db: testPrisma, mailer },
      { orderCode: order.orderCode },
    );

    expect(mailer.send).toHaveBeenCalledTimes(1);
    const message = mailer.messages[0];
    expect(message.to).toBe(order.email);
    expect(message.html).toContain(order.orderCode);
    expect(message.html).toContain("630.000"); // subtotal 600000 + ship 30000
    expect(message.html).toContain(encodeURIComponent(order.orderCode)); // addInfo trong URL QR
    expect(message.html).toContain("img.vietqr.io");
  });

  it("orderCode không tồn tại → throw (không gọi mailer.send)", async () => {
    const mailer = fakeMailer();

    await expect(
      handleSendOrderConfirmation({ db: testPrisma, mailer }, { orderCode: "LEAF-KHONGCO" }),
    ).rejects.toThrow();

    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("payload sai schema → throw (không gọi mailer.send)", async () => {
    const mailer = fakeMailer();

    await expect(
      handleSendOrderConfirmation({ db: testPrisma, mailer }, { foo: "bar" }),
    ).rejects.toThrow();

    expect(mailer.send).not.toHaveBeenCalled();
  });
});
