import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { actionMock, refreshMock, showMock } = vi.hoisted(() => ({
  actionMock: vi.fn(),
  refreshMock: vi.fn(),
  showMock: vi.fn(),
}));

vi.mock("@/server/actions/storefront", () => ({
  setHomeHeroProductAction: actionMock,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock("@/components/admin/admin-toast-provider", () => ({
  useAdminToast: () => ({ show: showMock }),
}));

import { HomeHeroControl } from "./home-hero-control";

describe("HomeHeroControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMock.mockResolvedValue({ ok: true });
  });

  it("selects this product for the home page", async () => {
    render(
      <HomeHeroControl productId="product-1" isSelected={false} canSelect />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Dùng làm banner trang chủ" }),
    );

    await waitFor(() => expect(actionMock).toHaveBeenCalledWith("product-1"));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("clears the saved choice when this product is selected", async () => {
    render(<HomeHeroControl productId="product-1" isSelected canSelect />);

    await userEvent.click(
      screen.getByRole("button", { name: "Dùng lựa chọn tự động" }),
    );

    await waitFor(() => expect(actionMock).toHaveBeenCalledWith(null));
  });

  it("does not offer an inactive or imageless product", () => {
    render(
      <HomeHeroControl
        productId="product-1"
        isSelected={false}
        canSelect={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Dùng làm banner trang chủ" }),
    ).toBeDisabled();
  });

  it("shows a failed save instead of refreshing", async () => {
    actionMock.mockResolvedValue({
      ok: false,
      error: "Sản phẩm không hợp lệ.",
    });
    render(
      <HomeHeroControl productId="product-1" isSelected={false} canSelect />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Dùng làm banner trang chủ" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sản phẩm không hợp lệ.",
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
