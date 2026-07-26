import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getBossMock,
  markOrderPaidManuallyCoreMock,
  prismaMock,
  redirectMock,
  requireAdminMock,
  revalidatePathMock,
  PaymentBusinessErrorMock,
} = vi.hoisted(() => {
  class PaymentBusinessError extends Error {
    constructor(public readonly code: string) {
      super(code);
      this.name = "PaymentBusinessError";
    }
  }

  return {
    getBossMock: vi.fn(),
    markOrderPaidManuallyCoreMock: vi.fn(),
    prismaMock: {},
    redirectMock: vi.fn((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    }),
    requireAdminMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    PaymentBusinessErrorMock: PaymentBusinessError,
  };
});

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/jobs/queue", () => ({ getBoss: getBossMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/server/payments/mark-order-paid", () => ({
  markOrderPaidManuallyCore: markOrderPaidManuallyCoreMock,
  PaymentBusinessError: PaymentBusinessErrorMock,
}));

import { confirmPaymentManuallyAction } from "@/server/actions/payments";

const VALID_ORDER_ID = "cm12345678901234567890123";

function sessionWithRole(role: string) {
  return {
    user: { id: "user-1", email: "admin@example.com", role },
    session: { id: "session-1" },
  };
}

describe("confirmPaymentManuallyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBossMock.mockResolvedValue(undefined);
    markOrderPaidManuallyCoreMock.mockResolvedValue({
      kind: "paid",
      orderCode: "LEAFABC123",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("để requireAdmin từ chối phiên ẩn danh trước mọi side effect", async () => {
    requireAdminMock.mockRejectedValue(new Error("REDIRECT:/login"));

    await expect(confirmPaymentManuallyAction("order-1")).rejects.toThrow(
      "REDIRECT:/login",
    );

    expect(getBossMock).not.toHaveBeenCalled();
    expect(markOrderPaidManuallyCoreMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("từ chối staff trước khi làm nóng queue hoặc gọi payment core", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("staff"));

    await expect(confirmPaymentManuallyAction("order-1")).rejects.toThrow(
      "REDIRECT:/",
    );

    expect(redirectMock).toHaveBeenCalledWith("/");
    expect(getBossMock).not.toHaveBeenCalled();
    expect(markOrderPaidManuallyCoreMock).not.toHaveBeenCalled();
  });

  it("trả lỗi validation an toàn cho orderId rỗng", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    await expect(confirmPaymentManuallyAction("   ")).resolves.toEqual({
      ok: false,
      error: "Mã đơn hàng không hợp lệ.",
    });

    expect(getBossMock).not.toHaveBeenCalled();
    expect(markOrderPaidManuallyCoreMock).not.toHaveBeenCalled();
  });

  it("trả lỗi validation cho orderId không rỗng nhưng sai định dạng CUID", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    await expect(
      confirmPaymentManuallyAction("not-an-order-id"),
    ).resolves.toEqual({
      ok: false,
      error: "Mã đơn hàng không hợp lệ.",
    });

    expect(getBossMock).not.toHaveBeenCalled();
    expect(markOrderPaidManuallyCoreMock).not.toHaveBeenCalled();
  });

  it("owner chỉ truyền orderId đã validate và làm nóng getBoss trước khi core mở transaction", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    await expect(
      confirmPaymentManuallyAction(`  ${VALID_ORDER_ID}  `),
    ).resolves.toEqual({ ok: true });

    expect(getBossMock).toHaveBeenCalledTimes(1);
    expect(markOrderPaidManuallyCoreMock).toHaveBeenCalledWith(
      prismaMock,
      VALID_ORDER_ID,
    );
    expect(getBossMock.mock.invocationCallOrder[0]).toBeLessThan(
      markOrderPaidManuallyCoreMock.mock.invocationCallOrder[0],
    );
    expect(revalidatePathMock).toHaveBeenNthCalledWith(
      1,
      "/admin/orders/pending",
    );
    expect(revalidatePathMock).toHaveBeenNthCalledWith(
      2,
      "/orders/LEAFABC123",
    );
  });

  it.each([
    ["ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."],
    [
      "ORDER_NOT_PENDING",
      "Đơn hàng không còn ở trạng thái chờ thanh toán.",
    ],
    [
      "INSUFFICIENT_STOCK",
      "Không đủ tồn kho để xác nhận thanh toán.",
    ],
    [
      "AMOUNT_MISMATCH",
      "Số tiền thanh toán không khớp với đơn hàng.",
    ],
  ])("đổi lỗi nghiệp vụ %s thành thông báo an toàn", async (code, message) => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
    markOrderPaidManuallyCoreMock.mockRejectedValue(
      new PaymentBusinessErrorMock(code),
    );

    await expect(confirmPaymentManuallyAction(VALID_ORDER_ID)).resolves.toEqual({
      ok: false,
      error: message,
    });

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each(["queue", "database"])(
    "che chi tiết lỗi hạ tầng từ %s bằng thông báo chung",
    async (source) => {
      requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
      const infrastructureError = new Error(
        "connect ECONNREFUSED 127.0.0.1:5432 secret",
      );
      if (source === "queue") {
        getBossMock.mockRejectedValue(infrastructureError);
      } else {
        markOrderPaidManuallyCoreMock.mockRejectedValue(infrastructureError);
      }
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      await expect(
        confirmPaymentManuallyAction(VALID_ORDER_ID),
      ).resolves.toEqual({
        ok: false,
        error: "Không thể xác nhận thanh toán lúc này. Vui lòng thử lại.",
      });

      expect(revalidatePathMock).not.toHaveBeenCalled();
    },
  );

  it.each(["queue", "database"])(
    "logs only a stable operation/category for %s failures and excludes every sensitive sentinel",
    async (source) => {
      requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
      const sentinels = [
        "secret-token-8f31",
        "private-customer@example.com",
        "0909123456",
        "001122334455",
      ];
      const infrastructureError = new Error(sentinels.join(" | "));
      if (source === "queue") {
        getBossMock.mockRejectedValue(infrastructureError);
      } else {
        markOrderPaidManuallyCoreMock.mockRejectedValue(infrastructureError);
      }
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await confirmPaymentManuallyAction(VALID_ORDER_ID);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[payments] operation=confirm-manual-payment category=infrastructure",
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
    },
  );
});
