import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// `vi.mock` bị hoist lên đầu file — action giả trả `{ ok: true }` (action
// thật chỉ trả giá trị khi validate lỗi; thành công thì redirect()).
const { updateVariantStockActionMock } = vi.hoisted(() => ({
  updateVariantStockActionMock: vi.fn(async () => ({ ok: true }) as const),
}));

vi.mock("@/server/actions/products", () => ({
  updateVariantStockAction: updateVariantStockActionMock,
}));

import { StockQuickEdit } from "./stock-quick-edit";

describe("StockQuickEdit", () => {
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
});
