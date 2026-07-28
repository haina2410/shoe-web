import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getBossMock,
  matchReviewedTransactionCoreMock,
  MatchReviewedTransactionErrorMock,
  prismaMock,
  requireAdminMock,
  revalidatePathMock,
} = vi.hoisted(() => {
  class MatchReviewedTransactionError extends Error {
    constructor(public readonly code: string) {
      super(code);
      this.name = "MatchReviewedTransactionError";
    }
  }

  return {
    getBossMock: vi.fn(),
    matchReviewedTransactionCoreMock: vi.fn(),
    MatchReviewedTransactionErrorMock: MatchReviewedTransactionError,
    prismaMock: {},
    requireAdminMock: vi.fn(),
    revalidatePathMock: vi.fn(),
  };
});

vi.mock("@/jobs/queue", () => ({ getBoss: getBossMock }));
vi.mock("@/lib/auth-guard", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/server/payments/match-reviewed-transaction", () => ({
  matchReviewedTransactionCore: matchReviewedTransactionCoreMock,
  MatchReviewedTransactionError: MatchReviewedTransactionErrorMock,
}));

import { matchReviewedTransactionAction } from "@/server/actions/bank-transactions";

const VALID_EVENT_ID = "cm12345678901234567890123";
const MATCHED_ORDER = {
  orderId: "cm98765432109876543210987",
  orderCode: "LEAFABC123",
};

function sessionWithRole(role: string) {
  return {
    user: { id: "user-1", email: "admin@example.com", role },
    session: { id: "session-1" },
  };
}

describe("matchReviewedTransactionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBossMock.mockResolvedValue(undefined);
    matchReviewedTransactionCoreMock.mockResolvedValue(MATCHED_ORDER);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets requireAdmin reject anonymous callers before validation or side effects", async () => {
    requireAdminMock.mockRejectedValue(new Error("REDIRECT:/login"));

    await expect(
      matchReviewedTransactionAction({
        bankTransactionId: "not-a-cuid",
        orderCode: "not-an-order-code",
      }),
    ).rejects.toThrow("REDIRECT:/login");

    expect(getBossMock).not.toHaveBeenCalled();
    expect(matchReviewedTransactionCoreMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each(["staff", "owner"])(
    "%s can match a reviewed event with the authenticated actor",
    async (role) => {
      requireAdminMock.mockResolvedValue(sessionWithRole(role));

      await expect(
        matchReviewedTransactionAction({
          bankTransactionId: VALID_EVENT_ID,
          orderCode: "LEAFABC123",
        }),
      ).resolves.toEqual({ ok: true });

      expect(matchReviewedTransactionCoreMock).toHaveBeenCalledWith(
        prismaMock,
        {
          bankTransactionId: VALID_EVENT_ID,
          orderCode: "LEAFABC123",
          recordedByUserId: "user-1",
        },
      );
    },
  );

  it("normalizes trimmed IDs and uppercases the canonical order code", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("staff"));

    await matchReviewedTransactionAction({
      bankTransactionId: `  ${VALID_EVENT_ID}  `,
      orderCode: "  leafabc123  ",
    });

    expect(matchReviewedTransactionCoreMock).toHaveBeenCalledWith(
      prismaMock,
      {
        bankTransactionId: VALID_EVENT_ID,
        orderCode: "LEAFABC123",
        recordedByUserId: "user-1",
      },
    );
  });

  it("rejects an invalid bank transaction CUID before warming the queue", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    await expect(
      matchReviewedTransactionAction({
        bankTransactionId: "not-a-cuid",
        orderCode: "LEAFABC123",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Mã giao dịch ngân hàng không hợp lệ.",
    });

    expect(getBossMock).not.toHaveBeenCalled();
    expect(matchReviewedTransactionCoreMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "LEAFABC12",
    "LEAFABC1234",
    "LEAFABC-12",
    "SEEDABC123",
    "LEAFABC12É",
  ])("rejects non-canonical order code %j", async (orderCode) => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    await expect(
      matchReviewedTransactionAction({
        bankTransactionId: VALID_EVENT_ID,
        orderCode,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Mã đơn hàng không hợp lệ.",
    });

    expect(getBossMock).not.toHaveBeenCalled();
    expect(matchReviewedTransactionCoreMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("warms the queue before the core opens the payment transaction", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("staff"));

    await matchReviewedTransactionAction({
      bankTransactionId: VALID_EVENT_ID,
      orderCode: "LEAFABC123",
    });

    expect(getBossMock).toHaveBeenCalledTimes(1);
    expect(getBossMock.mock.invocationCallOrder[0]).toBeLessThan(
      matchReviewedTransactionCoreMock.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ["EVENT_NOT_FOUND", "Không tìm thấy giao dịch ngân hàng."],
    [
      "EVENT_NOT_REVIEWABLE",
      "Giao dịch ngân hàng không còn chờ đối soát.",
    ],
    ["ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."],
    ["AMOUNT_MISMATCH", "Số tiền giao dịch không khớp với đơn hàng."],
    [
      "ORDER_NOT_PENDING",
      "Đơn hàng không còn ở trạng thái chờ thanh toán.",
    ],
    ["INSUFFICIENT_STOCK", "Không đủ tồn kho để xác nhận thanh toán."],
  ])("maps %s to a stable, safe business message", async (code, message) => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
    matchReviewedTransactionCoreMock.mockRejectedValue(
      new MatchReviewedTransactionErrorMock(code),
    );

    await expect(
      matchReviewedTransactionAction({
        bankTransactionId: VALID_EVENT_ID,
        orderCode: "LEAFABC123",
      }),
    ).resolves.toEqual({ ok: false, error: message });

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each(["queue", "database"])(
    "hides %s infrastructure details and logs only a stable category",
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
        matchReviewedTransactionCoreMock.mockRejectedValue(infrastructureError);
      }
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await expect(
        matchReviewedTransactionAction({
          bankTransactionId: VALID_EVENT_ID,
          orderCode: "LEAFABC123",
        }),
      ).resolves.toEqual({
        ok: false,
        error: "Không thể ghép giao dịch lúc này. Vui lòng thử lại.",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[payments] operation=match-reviewed-transaction category=infrastructure",
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
    },
  );

  it("revalidates review, admin list/detail, and public order paths from the core result", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("staff"));

    await matchReviewedTransactionAction({
      bankTransactionId: VALID_EVENT_ID,
      orderCode: "LEAFABC123",
    });

    expect(revalidatePathMock).toHaveBeenNthCalledWith(
      1,
      "/admin/bank-transactions/review",
    );
    expect(revalidatePathMock).toHaveBeenNthCalledWith(2, "/admin/orders");
    expect(revalidatePathMock).toHaveBeenNthCalledWith(
      3,
      `/admin/orders/${MATCHED_ORDER.orderId}`,
    );
    expect(revalidatePathMock).toHaveBeenNthCalledWith(
      4,
      `/orders/${MATCHED_ORDER.orderCode}`,
    );
  });

  it("keeps a committed match successful and attempts every path when revalidation fails", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
    revalidatePathMock.mockImplementationOnce(() => {
      throw new Error("private-customer@example.com");
    });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      matchReviewedTransactionAction({
        bankTransactionId: VALID_EVENT_ID,
        orderCode: "LEAFABC123",
      }),
    ).resolves.toEqual({ ok: true });

    expect(matchReviewedTransactionCoreMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledTimes(4);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[payments] operation=match-reviewed-transaction-revalidate category=infrastructure",
    );
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(
      "private-customer@example.com",
    );
  });
});
