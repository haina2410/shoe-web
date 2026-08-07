import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminStatusBadge } from "./admin-status-badge";

describe("AdminStatusBadge", () => {
  it.each([
    ["neutral", "Trung tính"],
    ["info", "Thông tin"],
    ["success", "Thành công"],
    ["warning", "Cảnh báo"],
    ["danger", "Nguy hiểm"],
    ["violet", "Tím"],
  ] as const)("keeps %s status text visible", (tone, label) => {
    render(<AdminStatusBadge tone={tone}>{label}</AdminStatusBadge>);

    expect(screen.getByText(label)).toBeVisible();
  });
});
