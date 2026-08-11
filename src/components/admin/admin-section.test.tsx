import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminSection } from "./admin-section";

describe("AdminSection", () => {
  it("groups a labelled section with an action and child content", () => {
    render(
      <AdminSection
        title="Cần xử lý"
        description="Các mục ưu tiên trong hôm nay."
        action={<button type="button">Xem tất cả</button>}
      >
        <p>3 đơn hàng chờ xử lý</p>
      </AdminSection>,
    );

    expect(screen.getByRole("heading", { name: "Cần xử lý" })).toBeInTheDocument();
    expect(screen.getByText("Các mục ưu tiên trong hôm nay.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xem tất cả" })).toBeInTheDocument();
    expect(screen.getByText("3 đơn hàng chờ xử lý")).toBeInTheDocument();
  });
});
