import { describe, it, expect, vi, beforeEach } from "vitest";

// `vi.mock(...)` bị hoist lên đầu file bởi vitest — mọi biến các factory bên
// dưới tham chiếu tới phải khai báo qua `vi.hoisted` để tránh lỗi
// "Cannot access '...' before initialization".
const { createOrderCoreMock } = vi.hoisted(() => ({
  createOrderCoreMock: vi.fn(),
}));

vi.mock("@/server/orders", () => ({
  createOrderCore: createOrderCoreMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

// Import SAU khi mock đã đăng ký (vi.mock được hoist lên đầu file bởi vitest).
import { createOrderAction } from "@/server/actions/checkout";
import type { CreateOrderInput } from "@/lib/validation/checkout";

const validInput: CreateOrderInput = {
  customerName: "Nguyễn Văn A",
  email: "khach@example.com",
  phone: "0901234567",
  province: "Hà Nội",
  ward: "Phường Ba Đình",
  addressLine: "123 Đường Láng",
  items: [{ variantId: "v1", quantity: 1 }],
};

describe("createOrderAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("input rỗng/không hợp lệ → trả {ok:false} và KHÔNG gọi createOrderCore", async () => {
    const result = await createOrderAction({
      ...validInput,
      email: "khong-phai-email",
      items: [],
    } as unknown as CreateOrderInput);

    expect(result.ok).toBe(false);
    expect(createOrderCoreMock).not.toHaveBeenCalled();
  });

  it("input hợp lệ, core thành công → trả {ok:true, orderCode}", async () => {
    createOrderCoreMock.mockResolvedValue({ orderCode: "LEAF-ABC123" });

    const result = await createOrderAction(validInput);

    expect(result).toEqual({ ok: true, orderCode: "LEAF-ABC123" });
    expect(createOrderCoreMock).toHaveBeenCalledTimes(1);
  });

  it("input hợp lệ nhưng core ném lỗi (vd hết hàng) → trả {ok:false, error} thay vì throw", async () => {
    createOrderCoreMock.mockRejectedValue(new Error("Hết hàng"));

    const result = await createOrderAction(validInput);

    expect(result).toEqual({ ok: false, error: "Hết hàng" });
  });
});
