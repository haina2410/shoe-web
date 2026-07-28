import { describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import AdminPendingOrdersPage from "./page";

describe("AdminPendingOrdersPage", () => {
  it("redirects to the pending-payment order filter", () => {
    AdminPendingOrdersPage();

    expect(redirectMock).toHaveBeenCalledWith(
      "/admin/orders?status=PENDING_PAYMENT",
    );
  });
});
