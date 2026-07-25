import { describe, it, expect } from "vitest";
import {
  QUEUE_SEND_ORDER_CONFIRMATION,
  orderConfirmationJobSchema,
} from "@/jobs/queue";

describe("orderConfirmationJobSchema", () => {
  it("chấp nhận payload chỉ có orderCode (KHÔNG có PII)", () => {
    expect(
      orderConfirmationJobSchema.parse({ orderCode: "LEAF-ABC123" }),
    ).toEqual({ orderCode: "LEAF-ABC123" });
  });

  it("loại payload thiếu orderCode", () => {
    expect(() => orderConfirmationJobSchema.parse({})).toThrow();
  });

  it("loại orderCode rỗng", () => {
    expect(() =>
      orderConfirmationJobSchema.parse({ orderCode: "" }),
    ).toThrow();
  });

  it("loại payload có field lạ chứa PII (email) lẫn vào — schema strip, nhưng orderCode vẫn phải có", () => {
    expect(() =>
      orderConfirmationJobSchema.parse({ email: "khach@example.com" }),
    ).toThrow();
  });

  it("tên queue đúng như đặc tả", () => {
    expect(QUEUE_SEND_ORDER_CONFIRMATION).toBe("send-order-confirmation");
  });
});
