import { beforeEach, describe, expect, it } from "vitest";
import {
  BankTransactionStatus,
  OrderStatus,
  PaymentDirection,
} from "@/generated/prisma/enums";
import {
  getAdminOrderDetail,
  listAdminOrders,
  listReviewedBankTransactions,
} from "@/server/queries/admin-orders";
import { resetDb, testPrisma } from "@/test/db";

async function createOrderFixture(input: {
  orderCode: string;
  status: OrderStatus;
  createdAt: Date;
  payments?: Array<{ direction: PaymentDirection; amount: number }>;
}) {
  const suffix = crypto.randomUUID();
  return testPrisma.order.create({
    data: {
      orderCode: input.orderCode,
      email: `${suffix}@example.com`,
      customerName: `Khách ${input.orderCode}`,
      phone: "0900000000",
      province: "Hà Nội",
      ward: "Ba Đình",
      addressLine: "1 Phố Đơn Hàng",
      subtotal: 100_000,
      shippingFee: 0,
      total: 100_000,
      status: input.status,
      createdAt: input.createdAt,
      payments: input.payments
        ? {
            create: input.payments.map((payment, index) => ({
              provider: "manual",
              transactionId: `${input.orderCode}-${index}-${suffix}`,
              amount: payment.amount,
              direction: payment.direction,
            })),
          }
        : undefined,
    },
  });
}

describe("listAdminOrders", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("filters by status, order code, and refunds while returning newest orders first", async () => {
    const noRefund = await createOrderFixture({
      orderCode: "LEAF-NO-REFUND",
      status: OrderStatus.PENDING_PAYMENT,
      createdAt: new Date("2026-07-20T08:00:00.000Z"),
    });
    const partialRefund = await createOrderFixture({
      orderCode: "LEAF-PARTIAL-REFUND",
      status: OrderStatus.PAID,
      createdAt: new Date("2026-07-21T08:00:00.000Z"),
      payments: [
        { direction: PaymentDirection.IN, amount: 100_000 },
        { direction: PaymentDirection.OUT, amount: 25_000 },
      ],
    });
    const fullRefund = await createOrderFixture({
      orderCode: "LEAF-FULL-REFUND",
      status: OrderStatus.FULFILLED,
      createdAt: new Date("2026-07-22T08:00:00.000Z"),
      payments: [
        { direction: PaymentDirection.IN, amount: 100_000 },
        { direction: PaymentDirection.OUT, amount: 100_000 },
      ],
    });

    const allOrders = await listAdminOrders(testPrisma, {
      refund: "all",
      query: "",
    });
    expect(allOrders.map((order) => order.id)).toEqual([
      fullRefund.id,
      partialRefund.id,
      noRefund.id,
    ]);
    expect(Object.keys(allOrders[0]).sort()).toEqual([
      "createdAt",
      "customerName",
      "id",
      "orderCode",
      "payments",
      "status",
      "total",
    ]);
    expect(allOrders[0]).toMatchObject({
      id: fullRefund.id,
      orderCode: "LEAF-FULL-REFUND",
      customerName: "Khách LEAF-FULL-REFUND",
      createdAt: new Date("2026-07-22T08:00:00.000Z"),
      total: 100_000,
      status: OrderStatus.FULFILLED,
      payments: expect.arrayContaining([
        { direction: PaymentDirection.IN, amount: 100_000 },
        { direction: PaymentDirection.OUT, amount: 100_000 },
      ]),
    });

    await expect(
      listAdminOrders(testPrisma, {
        status: OrderStatus.PAID,
        refund: "all",
        query: "",
      }),
    ).resolves.toMatchObject([{ id: partialRefund.id }]);
    await expect(
      listAdminOrders(testPrisma, {
        refund: "all",
        query: "LEAF-PARTIAL",
      }),
    ).resolves.toMatchObject([{ id: partialRefund.id }]);
    await expect(
      listAdminOrders(testPrisma, {
        refund: "with",
        query: "",
      }),
    ).resolves.toMatchObject([{ id: fullRefund.id }, { id: partialRefund.id }]);
  });
});

describe("listReviewedBankTransactions", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns the oldest review-required events with masked accounts and safe reason labels", async () => {
    const suffix = crypto.randomUUID();
    const older = await testPrisma.bankTransaction.create({
      data: {
        provider: "sepay",
        providerTransactionId: `review-older-${suffix}`,
        gateway: "VCB",
        accountNumber: "0123456789",
        transferType: "in",
        amount: 120_000,
        paymentCode: "LEAFABC123",
        content: "Thanh toan LEAFABC123",
        occurredAt: new Date("2026-07-20T08:00:00.000Z"),
        createdAt: new Date("2026-07-20T08:01:00.000Z"),
        rawPayload: { secret: "older-raw-payload" },
        status: BankTransactionStatus.REVIEW_REQUIRED,
        reviewReason: "MISSING_ORDER_CODE",
      },
    });
    const unknownReason = await testPrisma.bankTransaction.create({
      data: {
        provider: "sepay",
        providerTransactionId: `review-unknown-${suffix}`,
        gateway: "ACB",
        accountNumber: "1234",
        transferType: "in",
        amount: 150_000,
        paymentCode: null,
        content: "Chuyen khoan can kiem tra",
        occurredAt: new Date("2026-07-20T09:00:00.000Z"),
        createdAt: new Date("2026-07-20T09:01:00.000Z"),
        rawPayload: { secret: "unknown-raw-payload" },
        status: BankTransactionStatus.REVIEW_REQUIRED,
        reviewReason: "UNEXPECTED_PERSISTED_REASON",
      },
    });
    const nullReason = await testPrisma.bankTransaction.create({
      data: {
        provider: "sepay",
        providerTransactionId: `review-null-${suffix}`,
        gateway: "MB",
        accountNumber: "99887766",
        transferType: "in",
        amount: 200_000,
        paymentCode: "LEAFDEF456",
        content: "Thanh toan LEAFDEF456",
        occurredAt: new Date("2026-07-20T10:00:00.000Z"),
        createdAt: new Date("2026-07-20T10:01:00.000Z"),
        rawPayload: { secret: "null-raw-payload" },
        status: BankTransactionStatus.REVIEW_REQUIRED,
        reviewReason: null,
      },
    });
    await testPrisma.bankTransaction.createMany({
      data: [
        {
          provider: "sepay",
          providerTransactionId: `received-${suffix}`,
          gateway: "VCB",
          accountNumber: "0111222333",
          transferType: "in",
          amount: 100_000,
          content: "Giao dich moi",
          occurredAt: new Date("2026-07-20T07:00:00.000Z"),
          createdAt: new Date("2026-07-20T07:01:00.000Z"),
          rawPayload: { secret: "received-raw-payload" },
          status: BankTransactionStatus.RECEIVED,
        },
        {
          provider: "sepay",
          providerTransactionId: `matched-${suffix}`,
          gateway: "VCB",
          accountNumber: "0444555666",
          transferType: "in",
          amount: 100_000,
          content: "Da ghep",
          occurredAt: new Date("2026-07-20T11:00:00.000Z"),
          createdAt: new Date("2026-07-20T11:01:00.000Z"),
          rawPayload: { secret: "matched-raw-payload" },
          status: BankTransactionStatus.MATCHED,
        },
      ],
    });

    const transactions = await listReviewedBankTransactions(testPrisma);

    expect(transactions.map((transaction) => transaction.id)).toEqual([
      older.id,
      unknownReason.id,
      nullReason.id,
    ]);
    expect(transactions).toEqual([
      expect.objectContaining({
        id: older.id,
        maskedAccountNumber: "•••• 6789",
        reviewReason: "MISSING_ORDER_CODE",
        reviewReasonLabel: "Không tìm thấy mã đơn trong giao dịch",
      }),
      expect.objectContaining({
        id: unknownReason.id,
        maskedAccountNumber: "••••",
        reviewReason: "UNEXPECTED_PERSISTED_REASON",
        reviewReasonLabel: "Cần kiểm tra thủ công",
      }),
      expect.objectContaining({
        id: nullReason.id,
        maskedAccountNumber: "•••• 7766",
        reviewReason: null,
        reviewReasonLabel: "Cần kiểm tra thủ công",
      }),
    ]);
    expect(Object.keys(transactions[0]).sort()).toEqual([
      "amount",
      "content",
      "gateway",
      "id",
      "maskedAccountNumber",
      "occurredAt",
      "paymentCode",
      "reviewReason",
      "reviewReasonLabel",
    ]);
    expect(JSON.stringify(transactions)).not.toContain("raw-payload");
  });

  it.each([
    ["ORDER_NOT_FOUND", "Mã đơn không tồn tại"],
    ["AMOUNT_MISMATCH", "Số tiền không khớp"],
    ["ORDER_NOT_PENDING", "Đơn không còn chờ thanh toán"],
    ["INSUFFICIENT_STOCK", "Không đủ tồn kho"],
  ])("maps %s to its Vietnamese review label", async (reviewReason, label) => {
    const transaction = await testPrisma.bankTransaction.create({
      data: {
        provider: "sepay",
        providerTransactionId: `review-reason-${crypto.randomUUID()}`,
        gateway: "VCB",
        accountNumber: "0123456789",
        transferType: "in",
        amount: 100_000,
        content: "Thanh toan can kiem tra",
        occurredAt: new Date("2026-07-20T08:00:00.000Z"),
        rawPayload: { secret: "reason-raw-payload" },
        status: BankTransactionStatus.REVIEW_REQUIRED,
        reviewReason,
      },
    });

    await expect(listReviewedBankTransactions(testPrisma)).resolves.toEqual([
      expect.objectContaining({
        id: transaction.id,
        reviewReason,
        reviewReasonLabel: label,
      }),
    ]);
  });
});

describe("getAdminOrderDetail", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns the complete safe detail read model with newest payment and bank history first", async () => {
    const suffix = crypto.randomUUID();
    const actor = await testPrisma.user.create({
      data: {
        id: `detail-actor-${suffix}`,
        name: "Nhân viên Lá",
        email: `detail-actor-${suffix}@example.com`,
      },
    });
    const category = await testPrisma.category.create({
      data: { name: "Giày chi tiết", slug: `detail-category-${suffix}` },
    });
    const product = await testPrisma.product.create({
      data: {
        name: "Giày hiện tại đã đổi tên",
        nameNormalized: "giay hien tai da doi ten",
        slug: `detail-product-${suffix}`,
        categoryId: category.id,
        basePrice: 300_000,
        variants: {
          create: {
            size: "42",
            color: "Xanh",
            sku: `DETAIL-${suffix}`,
            stock: 5,
          },
        },
      },
      include: { variants: true },
    });
    const order = await testPrisma.order.create({
      data: {
        orderCode: `LEAF-DETAIL-${suffix}`,
        email: "khach@example.com",
        customerName: "Nguyễn Khách",
        phone: "0901234567",
        province: "Đà Nẵng",
        ward: "Hải Châu",
        addressLine: "12 Đường Lá",
        note: "Giao giờ hành chính",
        subtotal: 250_000,
        shippingFee: 30_000,
        total: 280_000,
        status: OrderStatus.PAID,
        paidAt: new Date("2026-07-27T08:00:00.000Z"),
        items: {
          create: {
            variantId: product.variants[0].id,
            productName: "Tên giày lúc đặt",
            size: "42",
            color: "Xanh",
            unitPrice: 250_000,
            quantity: 1,
          },
        },
        payments: {
          create: [
            {
              provider: "sepay",
              transactionId: `detail-in-${suffix}`,
              amount: 280_000,
              direction: PaymentDirection.IN,
              matchedAt: new Date("2026-07-27T08:00:00.000Z"),
              rawPayload: { secret: "incoming-raw-payload" },
            },
            {
              provider: "manual",
              transactionId: `detail-out-${suffix}`,
              amount: 80_000,
              direction: PaymentDirection.OUT,
              matchedAt: new Date("2026-07-28T08:00:00.000Z"),
              externalReference: "BANK-REF-80",
              note: "Hoàn một phần",
              recordedByUserId: actor.id,
              rawPayload: { secret: "refund-raw-payload" },
            },
          ],
        },
        bankTransactions: {
          create: [
            {
              provider: "sepay",
              providerTransactionId: `bank-older-${suffix}`,
              gateway: "VCB",
              accountNumber: "0123456789",
              transferType: "in",
              amount: 280_000,
              content: "Thanh toan LEAF DETAIL",
              referenceCode: "REF-OLDER",
              occurredAt: new Date("2026-07-27T07:59:00.000Z"),
              rawPayload: { secret: "older-bank-payload" },
            },
            {
              provider: "sepay",
              providerTransactionId: `bank-newer-${suffix}`,
              gateway: "VCB",
              accountNumber: "0123456789",
              transferType: "in",
              amount: 280_000,
              content: "Doi soat LEAF DETAIL",
              referenceCode: "REF-NEWER",
              occurredAt: new Date("2026-07-27T08:01:00.000Z"),
              rawPayload: { secret: "newer-bank-payload" },
            },
          ],
        },
      },
    });

    const detail = await getAdminOrderDetail(testPrisma, order.id);

    expect(detail).toMatchObject({
      id: order.id,
      orderCode: order.orderCode,
      email: "khach@example.com",
      customerName: "Nguyễn Khách",
      phone: "0901234567",
      province: "Đà Nẵng",
      ward: "Hải Châu",
      addressLine: "12 Đường Lá",
      note: "Giao giờ hành chính",
      subtotal: 250_000,
      shippingFee: 30_000,
      total: 280_000,
      status: OrderStatus.PAID,
      items: [
        {
          productName: "Tên giày lúc đặt",
          size: "42",
          color: "Xanh",
          unitPrice: 250_000,
          quantity: 1,
        },
      ],
      ledgerSummary: {
        totalIn: 280_000,
        totalOut: 80_000,
        netReceived: 200_000,
        refundState: "PARTIAL",
      },
      nextOrderStatuses: [OrderStatus.FULFILLED],
    });
    expect(detail?.payments.map((payment) => payment.direction)).toEqual([
      PaymentDirection.OUT,
      PaymentDirection.IN,
    ]);
    expect(detail?.payments[0]).toMatchObject({
      provider: "manual",
      transactionId: `detail-out-${suffix}`,
      externalReference: "BANK-REF-80",
      note: "Hoàn một phần",
      recordedBy: {
        name: "Nhân viên Lá",
        email: `detail-actor-${suffix}@example.com`,
      },
    });
    expect(detail?.bankTransactions.map((transaction) => transaction.referenceCode)).toEqual([
      "REF-NEWER",
      "REF-OLDER",
    ]);
    expect(detail?.bankTransactions[0]).toMatchObject({
      gateway: "VCB",
      accountNumber: "0123456789",
      amount: 280_000,
      content: "Doi soat LEAF DETAIL",
    });
    expect(detail?.payments[0]).not.toHaveProperty("rawPayload");
    expect(detail?.bankTransactions[0]).not.toHaveProperty("rawPayload");
  });

  it("removes fulfillment from a fully refunded paid order", async () => {
    const order = await createOrderFixture({
      orderCode: `LEAF-FULL-DETAIL-${crypto.randomUUID()}`,
      status: OrderStatus.PAID,
      createdAt: new Date("2026-07-28T09:00:00.000Z"),
      payments: [
        { direction: PaymentDirection.IN, amount: 100_000 },
        { direction: PaymentDirection.OUT, amount: 100_000 },
      ],
    });

    await expect(getAdminOrderDetail(testPrisma, order.id)).resolves.toMatchObject({
      ledgerSummary: {
        totalIn: 100_000,
        totalOut: 100_000,
        netReceived: 0,
        refundState: "FULL",
      },
      nextOrderStatuses: [],
    });
  });
});
