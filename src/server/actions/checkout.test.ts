import { describe, it, expect, vi, beforeEach } from "vitest";

// `vi.mock(...)` bị hoist lên đầu file bởi vitest — mọi biến các factory bên
// dưới tham chiếu tới phải khai báo qua `vi.hoisted` để tránh lỗi
// "Cannot access '...' before initialization".
const { createOrderCoreMock, getBossMock } = vi.hoisted(() => ({
  createOrderCoreMock: vi.fn(),
  getBossMock: vi.fn(),
}));

vi.mock("@/server/orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/orders")>()),
  createOrderCore: createOrderCoreMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

// F3: `createOrderAction` giờ gọi `getBoss()` để "làm nóng" pg-boss TRƯỚC
// transaction — mock hẳn module này (không cần boss/DB thật) để test hành vi
// của action theo từng kịch bản getBoss() thành công/thất bại.
vi.mock("@/jobs/queue", () => ({
  getBoss: getBossMock,
}));

// Import SAU khi mock đã đăng ký (vi.mock được hoist lên đầu file bởi vitest).
import { createOrderAction } from "@/server/actions/checkout";
import { OrderBusinessError } from "@/server/orders";
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
    // Mặc định getBoss() "làm nóng" thành công — các test không nhắm vào F3
    // không cần quan tâm việc này, chỉ những test bên dưới ghi đè lại.
    getBossMock.mockResolvedValue(undefined);
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

  it("input hợp lệ nhưng core ném lỗi nghiệp vụ (vd hết hàng) → trả {ok:false, error} giữ nguyên thông báo", async () => {
    createOrderCoreMock.mockRejectedValue(new OrderBusinessError("Hết hàng"));

    const result = await createOrderAction(validInput);

    expect(result).toEqual({ ok: false, error: "Hết hàng" });
  });

  it("core ném lỗi hạ tầng (không phải OrderBusinessError, vd lỗi enqueue pg-boss) → trả câu lỗi chung, KHÔNG rò rỉ chi tiết nội bộ", async () => {
    createOrderCoreMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    const result = await createOrderAction(validInput);

    expect(result).toEqual({
      ok: false,
      error: "Không thể tạo đơn hàng, vui lòng thử lại.",
    });
  });

  // --- F3: làm nóng getBoss() TRƯỚC transaction tạo đơn ---

  it("input hợp lệ → getBoss() được gọi TRƯỚC createOrderCore (làm nóng hàng đợi ngoài transaction, F3)", async () => {
    createOrderCoreMock.mockResolvedValue({ orderCode: "LEAF-ABC123" });

    await createOrderAction(validInput);

    expect(getBossMock).toHaveBeenCalledTimes(1);
    expect(createOrderCoreMock).toHaveBeenCalledTimes(1);
    expect(getBossMock.mock.invocationCallOrder[0]).toBeLessThan(
      createOrderCoreMock.mock.invocationCallOrder[0],
    );
  });

  it("getBoss() thất bại → trả lỗi chung, KHÔNG gọi createOrderCore (không mở transaction khi hàng đợi chưa sẵn sàng, F3)", async () => {
    getBossMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    const result = await createOrderAction(validInput);

    expect(result).toEqual({
      ok: false,
      error: "Không thể tạo đơn hàng, vui lòng thử lại.",
    });
    expect(createOrderCoreMock).not.toHaveBeenCalled();
  });

  // --- F9: lỗi hạ tầng phải để lại dấu vết trong log (không PII) ---

  it("getBoss() thất bại → console.error được gọi, KHÔNG chứa PII của input (F9)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getBossMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    await createOrderAction(validInput);

    expect(consoleErrorSpy).toHaveBeenCalled();
    const logged = consoleErrorSpy.mock.calls.flat().join(" ");
    expect(logged).not.toContain(validInput.email);
    expect(logged).not.toContain(validInput.phone);
    expect(logged).not.toContain(validInput.addressLine);
    consoleErrorSpy.mockRestore();
  });

  it("core ném lỗi hạ tầng → console.error được gọi với tên+thông điệp lỗi, KHÔNG chứa PII của input (F9)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createOrderCoreMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    await createOrderAction(validInput);

    expect(consoleErrorSpy).toHaveBeenCalled();
    const logged = consoleErrorSpy.mock.calls.flat().join(" ");
    expect(logged).toContain("ECONNREFUSED");
    expect(logged).not.toContain(validInput.email);
    expect(logged).not.toContain(validInput.phone);
    expect(logged).not.toContain(validInput.addressLine);
    consoleErrorSpy.mockRestore();
  });

  it("core ném lỗi NGHIỆP VỤ (OrderBusinessError) → KHÔNG gọi console.error (không phải lỗi hạ tầng)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createOrderCoreMock.mockRejectedValue(new OrderBusinessError("Hết hàng"));

    await createOrderAction(validInput);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
