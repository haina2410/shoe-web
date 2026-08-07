import { beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// `vi.mock` bị hoist lên đầu file — action giả trả `{ ok: true }` (action
// thật chỉ trả giá trị khi validate lỗi; thành công thì redirect()).
type StockActionResult = { ok: true } | { ok: false; error: string };

const { updateVariantStockActionMock, refreshMock, showToastMock } = vi.hoisted(
  () => ({
    updateVariantStockActionMock:
      vi.fn<(input: unknown) => Promise<StockActionResult>>(async () => ({ ok: true })),
    refreshMock: vi.fn(),
    showToastMock: vi.fn(),
  }),
);

vi.mock("@/server/actions/products", () => ({
  updateVariantStockAction: updateVariantStockActionMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/components/admin/admin-toast-provider", () => ({
  useAdminToast: () => ({ show: showToastMock }),
}));

import { StockQuickEdit } from "./stock-quick-edit";

describe("StockQuickEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateVariantStockActionMock.mockResolvedValue({ ok: true });
  });

  it("gọi updateVariantStockAction với variantId và giá trị tồn kho đã sửa", async () => {
    const user = userEvent.setup();
    render(<StockQuickEdit variantId="variant-1" initialStock={5} />);

    const input = screen.getByLabelText("Tồn kho");
    await user.clear(input);
    await user.type(input, "12");

    await user.click(screen.getByRole("button", { name: /lưu/i }));

    expect(updateVariantStockActionMock).toHaveBeenCalledWith({
      variantId: "variant-1",
      stock: 12,
      expectedStock: 5,
    });
  });

  it("locks the stock input and blocks duplicate saves while pending", async () => {
    let resolveAction: ((value: { ok: true }) => void) | undefined;
    updateVariantStockActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(<StockQuickEdit variantId="variant-1" initialStock={5} />);

    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    fireEvent.click(screen.getByRole("button", { name: "Đang lưu…" }));

    expect(updateVariantStockActionMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Tồn kho")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Đang lưu…" })).toBeDisabled();

    resolveAction?.({ ok: true });
    await screen.findByRole("button", { name: "Lưu" });
  });

  it("keeps stale stock failures inline", async () => {
    updateVariantStockActionMock.mockResolvedValue({
      ok: false,
      error: "Tồn kho đã thay đổi. Hãy tải lại trang và thử lại.",
    });
    const user = userEvent.setup();
    render(<StockQuickEdit variantId="variant-1" initialStock={5} />);

    await user.click(screen.getByRole("button", { name: "Lưu" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tồn kho đã thay đổi. Hãy tải lại trang và thử lại.",
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("announces success and refreshes the current product view", async () => {
    const user = userEvent.setup();
    render(<StockQuickEdit variantId="variant-1" initialStock={5} />);

    await user.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith({
        title: "Đã cập nhật tồn kho",
        description: "Tồn kho biến thể đã được lưu.",
        tone: "success",
      });
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });
});
