import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StorefrontSearch } from "./storefront-search";

describe("StorefrontSearch", () => {
  it("gửi truy vấn q đến trang sản phẩm bằng GET", () => {
    render(<StorefrontSearch />);

    expect(screen.getByRole("search")).toHaveAttribute("action", "/products");
    expect(screen.getByRole("searchbox", { name: "Tìm sản phẩm" })).toHaveAttribute(
      "name",
      "q",
    );
  });
});
