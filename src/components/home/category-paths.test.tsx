import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CATEGORY_PATHS } from "@/lib/storefront-content";
import { CategoryPaths } from "./category-paths";

describe("CategoryPaths", () => {
  it("đưa người mua tới từng danh mục được cửa hàng hỗ trợ", () => {
    render(<CategoryPaths />);

    for (const category of CATEGORY_PATHS) {
      expect(screen.getByRole("link", { name: category.label })).toHaveAttribute(
        "href",
        category.href,
      );
    }
  });
});
