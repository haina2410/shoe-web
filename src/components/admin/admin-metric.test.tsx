import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminMetric } from "./admin-metric";

describe("AdminMetric", () => {
  it("renders a label, value, and optional description", () => {
    render(
      <AdminMetric
        label="Đơn chờ xử lý"
        value="12"
        description="Cần xác nhận trong hôm nay"
      />,
    );

    expect(screen.getByText("Đơn chờ xử lý")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Cần xác nhận trong hôm nay")).toBeInTheDocument();
  });
});
