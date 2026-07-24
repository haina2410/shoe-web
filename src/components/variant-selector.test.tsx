import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VariantSelector } from "./variant-selector";
import type { Variant } from "@/generated/prisma/client";

function makeVariant(overrides: Partial<Variant>): Variant {
  return {
    id: "var-1",
    productId: "prod-1",
    size: "39",
    color: "Đen",
    sku: "SKU-1",
    priceOverride: null,
    stock: 0,
    ...overrides,
  };
}

// Bộ variant dùng chung cho các test: 39/Đen còn hàng, 39/Trắng hết hàng,
// 40/Đen KHÔNG tồn tại (không có variant nào khớp size=40,color=Đen).
const variants: Variant[] = [
  makeVariant({ id: "v-39-den", size: "39", color: "Đen", sku: "SKU-39-DEN", stock: 5 }),
  makeVariant({ id: "v-39-trang", size: "39", color: "Trắng", sku: "SKU-39-TRANG", stock: 0 }),
  makeVariant({
    id: "v-40-trang",
    size: "40",
    color: "Trắng",
    sku: "SKU-40-TRANG",
    stock: 3,
    priceOverride: 750000,
  }),
];

describe("VariantSelector", () => {
  it("chọn size+màu còn hàng → hiện đúng số lượng tồn kho", async () => {
    const user = userEvent.setup();
    render(<VariantSelector variants={variants} basePrice={890000} />);

    await user.click(screen.getByRole("radio", { name: "39" }));
    await user.click(screen.getByRole("radio", { name: "Đen" }));

    expect(screen.getByText("Còn 5 sản phẩm")).toBeInTheDocument();
  });

  it("chọn tổ hợp hết hàng (stock = 0) → hiện 'Hết hàng' và nút thêm giỏ bị disable", async () => {
    const user = userEvent.setup();
    render(<VariantSelector variants={variants} basePrice={890000} />);

    await user.click(screen.getByRole("radio", { name: "39" }));
    await user.click(screen.getByRole("radio", { name: "Trắng" }));

    expect(screen.getByText("Hết hàng")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /thêm vào giỏ/i })).toBeDisabled();
  });

  it("tổ hợp size+màu không tồn tại variant nào → không crash, báo không có lựa chọn", async () => {
    const user = userEvent.setup();
    render(<VariantSelector variants={variants} basePrice={890000} />);

    // size 40 chỉ tồn tại với màu Trắng, không có 40/Đen.
    await user.click(screen.getByRole("radio", { name: "40" }));
    await user.click(screen.getByRole("radio", { name: "Đen" }));

    expect(screen.getByText("Không có lựa chọn này")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /thêm vào giỏ/i })).toBeDisabled();
  });

  it("hiển thị giá theo priceOverride của variant đang chọn khi có", async () => {
    const user = userEvent.setup();
    render(<VariantSelector variants={variants} basePrice={890000} />);

    await user.click(screen.getByRole("radio", { name: "40" }));
    await user.click(screen.getByRole("radio", { name: "Trắng" }));

    expect(screen.getByText("750.000 ₫")).toBeInTheDocument();
  });

  it("nút thêm vào giỏ luôn disabled kể cả khi chọn được variant còn hàng (Ngày 5 mới nối action)", async () => {
    const user = userEvent.setup();
    render(<VariantSelector variants={variants} basePrice={890000} />);

    // Trước khi chọn gì, nút vẫn disabled.
    expect(screen.getByRole("button", { name: /thêm vào giỏ/i })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "39" }));
    await user.click(screen.getByRole("radio", { name: "Đen" }));

    // Dù variant đã chọn còn hàng (stock=5), nút vẫn phải disabled ở Ngày 4.
    expect(screen.getByRole("button", { name: /thêm vào giỏ/i })).toBeDisabled();
  });
});
