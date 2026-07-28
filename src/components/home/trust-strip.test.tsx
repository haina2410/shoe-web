import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TRUST_ITEMS } from "@/lib/storefront-content";
import { TrustStrip } from "./trust-strip";

describe("TrustStrip", () => {
  it("nêu rõ các cam kết mua hàng có thể kiểm chứng", () => {
    render(<TrustStrip />);

    for (const item of TRUST_ITEMS) {
      expect(screen.getByText(item.title)).toBeInTheDocument();
    }
  });
});
