import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { requireAdminMock } = vi.hoisted(() => ({ requireAdminMock: vi.fn() }));
vi.mock("@/lib/auth-guard", () => ({ requireAdmin: requireAdminMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/admin/admin-toast-provider", () => ({
  useAdminToast: () => ({ show: vi.fn() }),
}));

import NewCategoryPage from "./page";

describe("NewCategoryPage", () => {
  it("authenticates and renders the creation form", async () => {
    render(await NewCategoryPage());

    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Thêm danh mục" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Thông tin danh mục" })).toBeInTheDocument();
  });
});
