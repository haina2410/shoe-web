import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders warning and destructive variants as solid actions", () => {
    render(
      <>
        <Button variant="warning">Cảnh báo</Button>
        <Button variant="destructive">Xóa</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Cảnh báo" })).toHaveClass(
      "bg-amber-600",
    );
    expect(screen.getByRole("button", { name: "Xóa" })).toHaveClass(
      "bg-destructive",
      "text-white",
    );
  });
});
