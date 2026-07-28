import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GlobalError from "./error";

describe("GlobalError", () => {
  it("giữ lỗi chi tiết riêng tư và cho phép thử lại", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();

    render(
      <GlobalError
        error={new Error("customer@example.com 0395000000")}
        reset={reset}
      />,
    );

    expect(screen.getByRole("heading", { name: "Có lỗi xảy ra" })).toBeInTheDocument();
    expect(screen.queryByText(/customer@example.com|0395000000/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
