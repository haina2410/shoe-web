import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/test/db";

describe("BankTransaction", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("stores an unmatched SePay event without an order and enforces provider id uniqueness", async () => {
    const eventInput = {
      provider: "sepay",
      providerTransactionId: "987654",
      gateway: "MBBank",
      accountNumber: "0000000000",
      transferType: "in",
      amount: 350_000,
      content: "LEAF-ABC123",
      referenceCode: "FT24123",
      occurredAt: new Date("2026-07-25T03:00:00.000Z"),
      rawPayload: { id: 987654 },
    };
    const event = await testPrisma.bankTransaction.create({
      data: eventInput,
    });

    expect(event.status).toBe("RECEIVED");
    expect(event.orderId).toBeNull();
    await expect(
      testPrisma.bankTransaction.create({
        data: { ...eventInput, providerTransactionId: "987654" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("stores a matched SePay event linked to its order", async () => {
    const category = await testPrisma.category.create({
      data: { name: "Giày chạy bộ", slug: "giay-chay-bo" },
    });
    const product = await testPrisma.product.create({
      data: {
        name: "Giày chạy bộ xanh",
        slug: "giay-chay-bo-xanh",
        categoryId: category.id,
        basePrice: 350_000,
      },
    });
    const variant = await testPrisma.variant.create({
      data: {
        productId: product.id,
        size: "40",
        color: "Xanh",
        sku: "MATCHED-BANK-40-XANH",
        stock: 1,
      },
    });
    const order = await testPrisma.order.create({
      data: {
        orderCode: "LEAF-MATCHED",
        email: "matched@example.com",
        customerName: "Nguyễn Văn A",
        phone: "0900000000",
        province: "Hồ Chí Minh",
        ward: "Phường 1",
        addressLine: "1 Đường Lê Lợi",
        subtotal: 350_000,
        shippingFee: 0,
        total: 350_000,
        items: {
          create: {
            variantId: variant.id,
            productName: product.name,
            size: variant.size,
            color: variant.color,
            unitPrice: 350_000,
            quantity: 1,
          },
        },
      },
    });

    const event = await testPrisma.bankTransaction.create({
      data: {
        provider: "sepay",
        providerTransactionId: "987655",
        gateway: "MBBank",
        accountNumber: "0000000000",
        transferType: "in",
        amount: 350_000,
        content: order.orderCode,
        occurredAt: new Date("2026-07-25T03:01:00.000Z"),
        rawPayload: { id: 987655 },
        status: "MATCHED",
        orderId: order.id,
      },
    });

    const persisted = await testPrisma.bankTransaction.findUnique({
      where: { id: event.id },
      include: { order: true },
    });

    expect(persisted).toMatchObject({
      status: "MATCHED",
      orderId: order.id,
      order: { id: order.id, orderCode: "LEAF-MATCHED" },
    });
  });
});
