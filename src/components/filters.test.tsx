import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/products",
  useSearchParams: () => new URLSearchParams(),
}));

import { Filters } from "./filters";

const categories = [
  { id: "cat-1", name: "Giày Sneaker", slug: "sneaker" },
  { id: "cat-2", name: "Giày Boot", slug: "boot" },
];

const facets = {
  sizes: ["38", "39", "40"],
  colors: ["Đen", "Trắng"],
};

beforeEach(() => {
  push.mockClear();
});

describe("Filters", () => {
  it("có landmark bộ lọc và liên kết xoá toàn bộ bộ lọc", () => {
    render(
      <Filters
        categories={categories}
        facets={facets}
        query={{ categorySlug: "sneaker", sizes: ["39"] }}
      />,
    );

    expect(
      screen.getByRole("complementary", { name: "Bộ lọc sản phẩm" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xoá bộ lọc" })).toHaveAttribute(
      "href",
      "/products",
    );
  });

  it("render danh mục từ props categories", () => {
    render(<Filters categories={categories} facets={facets} query={{}} />);
    expect(screen.getByText("Giày Sneaker")).toBeInTheDocument();
    expect(screen.getByText("Giày Boot")).toBeInTheDocument();
  });

  it("render checkbox size từ facets.sizes", () => {
    render(<Filters categories={categories} facets={facets} query={{}} />);
    expect(screen.getByRole("checkbox", { name: "38" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "39" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "40" })).toBeInTheDocument();
  });

  it("render checkbox màu từ facets.colors", () => {
    render(<Filters categories={categories} facets={facets} query={{}} />);
    expect(screen.getByRole("checkbox", { name: "Đen" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Trắng" })).toBeInTheDocument();
  });

  it("render checkbox khoảng giá từ PRICE_RANGES", () => {
    render(<Filters categories={categories} facets={facets} query={{}} />);
    expect(screen.getByRole("checkbox", { name: "Dưới 500k" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Trên 1,5 triệu" })).toBeInTheDocument();
  });

  it("render select sort với 3 lựa chọn", () => {
    render(<Filters categories={categories} facets={facets} query={{}} />);
    const select = screen.getByRole("combobox", { name: /sắp xếp/i });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Mới nhất" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Giá tăng dần" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Giá giảm dần" })).toBeInTheDocument();
  });

  it("tick checkbox size '39' → gọi router.push với query size=39", async () => {
    const user = userEvent.setup();
    render(<Filters categories={categories} facets={facets} query={{}} />);

    await user.click(screen.getByRole("checkbox", { name: "39" }));

    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(url.startsWith("/products?")).toBe(true);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.getAll("sizes")).toEqual(["39"]);
  });

  it("bỏ tick checkbox màu đang chọn → xoá màu khỏi query", async () => {
    const user = userEvent.setup();
    render(
      <Filters
        categories={categories}
        facets={facets}
        query={{ colors: ["Đen"] }}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Đen" }));

    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.getAll("colors")).toEqual([]);
  });

  it("đổi sort → gọi router.push với query sort đúng", async () => {
    const user = userEvent.setup();
    render(<Filters categories={categories} facets={facets} query={{}} />);

    const select = screen.getByRole("combobox", { name: /sắp xếp/i });
    await user.selectOptions(select, "gia-tang");

    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("sort")).toBe("gia-tang");
  });

  it("nhập từ khoá tìm kiếm rồi nhấn Enter → gọi router.push với query q", async () => {
    const user = userEvent.setup();
    render(<Filters categories={categories} facets={facets} query={{}} />);

    const input = screen.getByRole("searchbox");
    await user.type(input, "sneaker{Enter}");

    expect(push).toHaveBeenCalled();
    const url = push.mock.calls[push.mock.calls.length - 1][0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("q")).toBe("sneaker");
  });
});
