import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompanyImage } from "@/lib/storefront-assets";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
    createElement("img", props),
}));

import { CompanyGallery } from "./company-gallery";

const images: readonly CompanyImage[] = [
  {
    src: "/company/one.jpg",
    alt: "Không gian trưng bày",
    caption: "Không gian trưng bày tại xưởng leafshoes",
    width: 1920,
    height: 1080,
  },
  {
    src: "/company/two.jpg",
    alt: "Sản phẩm hoàn thiện",
    caption: "Sản phẩm trong quá trình hoàn thiện",
    width: 1920,
    height: 1440,
  },
  {
    src: "/company/three.jpg",
    alt: "Ngày khai trương",
    caption: "Một dấu mốc trong hành trình của leafshoes",
    width: 1920,
    height: 1440,
  },
];

function renderGallery() {
  render(<CompanyGallery images={images} />);
  return screen.getByRole("region", { name: "Khoảnh khắc tại leafshoes" });
}

describe("CompanyGallery", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hiển thị ảnh, chú thích và vị trí đầu tiên", () => {
    renderGallery();

    expect(screen.getByRole("img", { name: "Không gian trưng bày" })).toHaveAttribute(
      "src",
      "/company/one.jpg",
    );
    expect(screen.getByText("Không gian trưng bày tại xưởng leafshoes")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toHaveAttribute("aria-live", "polite");
  });

  it("quay vòng về ảnh đầu khi dùng nút ảnh tiếp theo từ ảnh cuối", async () => {
    const user = userEvent.setup();
    renderGallery();

    const next = screen.getByRole("button", { name: "Ảnh tiếp theo" });
    await user.click(next);
    await user.click(next);
    await user.click(next);

    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("quay vòng về ảnh cuối khi dùng nút ảnh trước đó từ ảnh đầu", async () => {
    const user = userEvent.setup();
    renderGallery();

    await user.click(screen.getByRole("button", { name: "Ảnh trước đó" }));

    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("chuyển ảnh kế tiếp khi nhấn ArrowRight", () => {
    const gallery = renderGallery();

    fireEvent.keyDown(gallery, { key: "ArrowRight" });

    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("chuyển ảnh trước đó khi nhấn ArrowLeft", () => {
    const gallery = renderGallery();

    fireEvent.keyDown(gallery, { key: "ArrowLeft" });

    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("chuyển ảnh kế tiếp khi vuốt sang trái quá 50 px", () => {
    const gallery = renderGallery();

    fireEvent.touchStart(gallery, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(gallery, { changedTouches: [{ clientX: 140 }] });

    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("không tự đổi ảnh theo thời gian", () => {
    vi.useFakeTimers();
    renderGallery();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("đặt tên rõ ràng cho hai nút điều khiển", () => {
    renderGallery();

    expect(screen.getByRole("button", { name: "Ảnh trước đó" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ảnh tiếp theo" })).toBeInTheDocument();
  });
});
