import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatus } from "@/generated/prisma/enums";

const {
  prismaMock,
  requireAdminMock,
  revalidatePathMock,
  updateOrderStatusCoreMock,
  UpdateOrderStatusErrorMock,
} = vi.hoisted(() => {
  class UpdateOrderStatusError extends Error {
    constructor(public readonly code: string) {
      super(code);
      this.name = "UpdateOrderStatusError";
    }
  }

  return {
    prismaMock: {},
    requireAdminMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    updateOrderStatusCoreMock: vi.fn(),
    UpdateOrderStatusErrorMock: UpdateOrderStatusError,
  };
});

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/server/orders/update-status", () => ({
  updateOrderStatusCore: updateOrderStatusCoreMock,
  UpdateOrderStatusError: UpdateOrderStatusErrorMock,
}));

import { updateOrderStatusAction } from "@/server/actions/order-status";

const VALID_ORDER_ID = "cm12345678901234567890123";

function sessionWithRole(role: string) {
  return {
    user: { id: "user-1", email: "admin@example.com", role },
    session: { id: "session-1" },
  };
}

describe("updateOrderStatusAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateOrderStatusCoreMock.mockResolvedValue({
      orderCode: "LEAFABC123",
      status: OrderStatus.FULFILLED,
    });
  });

  it("lets requireAdmin reject anonymous callers before validation or core work", async () => {
    requireAdminMock.mockRejectedValue(new Error("REDIRECT:/login"));

    await expect(
      updateOrderStatusAction("not-a-cuid", "NOT_A_STATUS"),
    ).rejects.toThrow("REDIRECT:/login");

    expect(updateOrderStatusCoreMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it.each(["staff", "owner"])(
    "%s can update an order status",
    async (role) => {
      requireAdminMock.mockResolvedValue(sessionWithRole(role));

      await expect(
        updateOrderStatusAction(VALID_ORDER_ID, "FULFILLED"),
      ).resolves.toEqual({ ok: true, status: OrderStatus.FULFILLED });

      expect(updateOrderStatusCoreMock).toHaveBeenCalledWith(prismaMock, {
        orderId: VALID_ORDER_ID,
        targetStatus: OrderStatus.FULFILLED,
      });
    },
  );

  it("returns a safe validation error for an invalid CUID", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    await expect(
      updateOrderStatusAction("not-an-order-id", "FULFILLED"),
    ).resolves.toEqual({ ok: false, error: "Mã đơn hàng không hợp lệ." });

    expect(updateOrderStatusCoreMock).not.toHaveBeenCalled();
  });

  it("returns a safe validation error for a status outside the generated enum", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    await expect(
      updateOrderStatusAction(VALID_ORDER_ID, "SHIPPED"),
    ).resolves.toEqual({
      ok: false,
      error: "Trạng thái đơn hàng không hợp lệ.",
    });

    expect(updateOrderStatusCoreMock).not.toHaveBeenCalled();
  });

  it("revalidates the admin list, detail, and public tracking pages after success", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("staff"));

    await updateOrderStatusAction(`  ${VALID_ORDER_ID}  `, "FULFILLED");

    expect(revalidatePathMock).toHaveBeenNthCalledWith(1, "/admin/orders");
    expect(revalidatePathMock).toHaveBeenNthCalledWith(
      2,
      `/admin/orders/${VALID_ORDER_ID}`,
    );
    expect(revalidatePathMock).toHaveBeenNthCalledWith(3, "/orders/LEAFABC123");
  });

  it.each([
    ["ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."],
    ["INVALID_TRANSITION", "Không thể chuyển đơn hàng sang trạng thái này."],
    ["FULLY_REFUNDED", "Đơn hàng đã được hoàn tiền toàn bộ."],
    [
      "STALE_ORDER",
      "Trạng thái đơn hàng đã thay đổi. Vui lòng tải lại trang và thử lại.",
    ],
  ])("maps %s to a stable business message", async (code, message) => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
    updateOrderStatusCoreMock.mockRejectedValue(
      new UpdateOrderStatusErrorMock(code),
    );

    await expect(
      updateOrderStatusAction(VALID_ORDER_ID, "FULFILLED"),
    ).resolves.toEqual({ ok: false, error: message });

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("hides infrastructure details and logs only the stable operation category", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
    const sentinels = [
      "secret-token-8f31",
      "private-customer@example.com",
      "0909123456",
      "001122334455",
    ];
    updateOrderStatusCoreMock.mockRejectedValue(new Error(sentinels.join(" | ")));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      updateOrderStatusAction(VALID_ORDER_ID, "FULFILLED"),
    ).resolves.toEqual({
      ok: false,
      error: "Không thể cập nhật trạng thái đơn hàng lúc này. Vui lòng thử lại.",
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[orders] operation=update-status category=infrastructure",
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
});
