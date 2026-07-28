import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  recordRefundCoreMock,
  requireAdminMock,
  revalidatePathMock,
  RecordRefundErrorMock,
} = vi.hoisted(() => {
  class RecordRefundError extends Error {
    constructor(public readonly code: string) {
      super(code);
      this.name = "RecordRefundError";
    }
  }

  return {
    prismaMock: {},
    recordRefundCoreMock: vi.fn(),
    requireAdminMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    RecordRefundErrorMock: RecordRefundError,
  };
});

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/server/payments/record-refund", () => ({
  recordRefundCore: recordRefundCoreMock,
  RecordRefundError: RecordRefundErrorMock,
}));

import { recordRefundAction } from "@/server/actions/refunds";

const VALID_ORDER_ID = "cm12345678901234567890123";
const SUMMARY = {
  totalIn: 100_000,
  totalOut: 60_000,
  netReceived: 40_000,
  refundState: "PARTIAL" as const,
};

function sessionWithRole(role: string) {
  return {
    user: { id: "user-1", email: "admin@example.com", role },
    session: { id: "session-1" },
  };
}

describe("recordRefundAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordRefundCoreMock.mockResolvedValue({
      orderCode: "LEAFABC123",
      paymentId: "payment-1",
      summary: SUMMARY,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets requireAdmin reject anonymous callers before validation or core work", async () => {
    requireAdminMock.mockRejectedValue(new Error("REDIRECT:/login"));

    await expect(
      recordRefundAction({
        orderId: "not-an-order-id",
        amount: 0,
      }),
    ).rejects.toThrow("REDIRECT:/login");

    expect(recordRefundCoreMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each(["staff", "owner"])(
    "%s can record a refund with the authenticated actor",
    async (role) => {
      requireAdminMock.mockResolvedValue(sessionWithRole(role));

      await expect(
        recordRefundAction({
          orderId: VALID_ORDER_ID,
          amount: 60_000,
        }),
      ).resolves.toEqual({ ok: true, summary: SUMMARY });

      expect(recordRefundCoreMock).toHaveBeenCalledWith(prismaMock, {
        orderId: VALID_ORDER_ID,
        amount: 60_000,
        recordedByUserId: "user-1",
        externalReference: undefined,
        note: undefined,
      });
    },
  );

  it("converts an HTML numeric value and propagates normalized strings", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("staff"));

    await recordRefundAction({
      orderId: `  ${VALID_ORDER_ID}  `,
      amount: "60000" as unknown as number,
      externalReference: "  REF-123  ",
      note: "   ",
    });

    expect(recordRefundCoreMock).toHaveBeenCalledWith(prismaMock, {
      orderId: VALID_ORDER_ID,
      amount: 60_000,
      recordedByUserId: "user-1",
      externalReference: "REF-123",
      note: undefined,
    });
  });

  it.each([
    { orderId: "not-a-cuid", amount: 60_000 },
    { orderId: VALID_ORDER_ID, amount: 0 },
    { orderId: VALID_ORDER_ID, amount: -1 },
    { orderId: VALID_ORDER_ID, amount: 10.5 },
    { orderId: VALID_ORDER_ID, amount: Number.NaN },
    {
      orderId: VALID_ORDER_ID,
      amount: 1,
      externalReference: "R".repeat(121),
    },
    { orderId: VALID_ORDER_ID, amount: 1, note: "N".repeat(501) },
  ])("rejects invalid refund input without core work: $input", async (input) => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    await expect(recordRefundAction(input)).resolves.toEqual({
      ok: false,
      error: "Thông tin hoàn tiền không hợp lệ.",
    });

    expect(recordRefundCoreMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each([
    ["ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."],
    [
      "ORDER_NOT_REFUNDABLE",
      "Đơn hàng không thể hoàn tiền ở trạng thái hiện tại.",
    ],
    [
      "NO_INCOMING_PAYMENT",
      "Đơn hàng chưa có khoản thanh toán để hoàn tiền.",
    ],
    [
      "REFUND_EXCEEDS_RECEIVED",
      "Số tiền hoàn vượt quá số tiền đã nhận.",
    ],
  ])("maps %s to a safe Vietnamese business message", async (code, message) => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
    recordRefundCoreMock.mockRejectedValue(new RecordRefundErrorMock(code));

    await expect(
      recordRefundAction({
        orderId: VALID_ORDER_ID,
        amount: 60_000,
      }),
    ).resolves.toEqual({ ok: false, error: message });

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("revalidates admin list, detail, and public tracking after success", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("staff"));

    await recordRefundAction({
      orderId: VALID_ORDER_ID,
      amount: 60_000,
    });

    expect(revalidatePathMock).toHaveBeenNthCalledWith(1, "/admin/orders");
    expect(revalidatePathMock).toHaveBeenNthCalledWith(
      2,
      `/admin/orders/${VALID_ORDER_ID}`,
    );
    expect(revalidatePathMock).toHaveBeenNthCalledWith(3, "/orders/LEAFABC123");
  });

  it("keeps a committed refund successful when cache revalidation throws", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
    const sentinels = [
      "private-customer@example.com",
      "0909123456",
      "GATEWAY-REF-123",
    ];
    revalidatePathMock.mockImplementationOnce(() => {
      throw new Error(sentinels.join(" | "));
    });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      recordRefundAction({
        orderId: VALID_ORDER_ID,
        amount: 60_000,
        externalReference: "GATEWAY-REF-123",
      }),
    ).resolves.toEqual({ ok: true, summary: SUMMARY });

    expect(recordRefundCoreMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledTimes(3);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[payments] operation=record-refund-revalidate category=infrastructure",
    );
    for (const call of consoleErrorSpy.mock.calls) {
      for (const argument of call) {
        const logged =
          typeof argument === "string" ? argument : JSON.stringify(argument);
        for (const sentinel of sentinels) {
          expect(logged).not.toContain(sentinel);
        }
      }
    }
  });

  it("hides infrastructure details and logs only a PII-free category", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
    const sentinels = [
      "secret-token-8f31",
      "private-customer@example.com",
      "0909123456",
      "GATEWAY-REF-123",
    ];
    recordRefundCoreMock.mockRejectedValue(new Error(sentinels.join(" | ")));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      recordRefundAction({
        orderId: VALID_ORDER_ID,
        amount: 60_000,
        externalReference: "GATEWAY-REF-123",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Không thể ghi nhận hoàn tiền lúc này. Vui lòng thử lại.",
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[payments] operation=record-refund category=infrastructure",
    );
    for (const call of consoleErrorSpy.mock.calls) {
      for (const argument of call) {
        const logged =
          typeof argument === "string" ? argument : JSON.stringify(argument);
        for (const sentinel of sentinels) {
          expect(logged).not.toContain(sentinel);
        }
      }
    }
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
