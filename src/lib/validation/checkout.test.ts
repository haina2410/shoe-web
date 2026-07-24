import { describe, it, expect } from "vitest";
import {
  checkoutItemSchema,
  createOrderInputSchema,
} from "@/lib/validation/checkout";

const validInput = {
  customerName: "Nguyễn Văn A",
  email: "a@example.com",
  phone: "0901234567",
  province: "Hà Nội",
  ward: "Phường Ba Đình",
  addressLine: "Số 1 Ngõ 2",
  items: [{ variantId: "v1", quantity: 1 }],
};

describe("checkoutItemSchema", () => {
  it("chấp nhận item hợp lệ", () => {
    expect(
      checkoutItemSchema.parse({ variantId: "v1", quantity: 2 }),
    ).toEqual({ variantId: "v1", quantity: 2 });
  });

  it("loại quantity < 1", () => {
    expect(() =>
      checkoutItemSchema.parse({ variantId: "v1", quantity: 0 }),
    ).toThrow();
  });

  it("loại quantity không nguyên", () => {
    expect(() =>
      checkoutItemSchema.parse({ variantId: "v1", quantity: 1.5 }),
    ).toThrow();
  });

  it("loại variantId rỗng", () => {
    expect(() =>
      checkoutItemSchema.parse({ variantId: "", quantity: 1 }),
    ).toThrow();
  });
});

describe("createOrderInputSchema", () => {
  it("chấp nhận input hợp lệ đầy đủ", () => {
    const parsed = createOrderInputSchema.parse(validInput);
    expect(parsed.customerName).toBe("Nguyễn Văn A");
    expect(parsed.province).toBe("Hà Nội");
  });

  it("chấp nhận note optional (thiếu note vẫn hợp lệ)", () => {
    expect(() => createOrderInputSchema.parse(validInput)).not.toThrow();
  });

  it("chấp nhận note khi có", () => {
    const parsed = createOrderInputSchema.parse({
      ...validInput,
      note: "Giao giờ hành chính",
    });
    expect(parsed.note).toBe("Giao giờ hành chính");
  });

  it("loại province ngoài danh sách 34 tỉnh/thành", () => {
    expect(() =>
      createOrderInputSchema.parse({ ...validInput, province: "Không Tồn Tại" }),
    ).toThrow();
  });

  it("loại email sai định dạng", () => {
    expect(() =>
      createOrderInputSchema.parse({ ...validInput, email: "not-an-email" }),
    ).toThrow();
  });

  it("loại items rỗng", () => {
    expect(() =>
      createOrderInputSchema.parse({ ...validInput, items: [] }),
    ).toThrow();
  });

  it("loại items có quantity < 1", () => {
    expect(() =>
      createOrderInputSchema.parse({
        ...validInput,
        items: [{ variantId: "v1", quantity: 0 }],
      }),
    ).toThrow();
  });

  it("loại customerName rỗng (sau trim)", () => {
    expect(() =>
      createOrderInputSchema.parse({ ...validInput, customerName: "   " }),
    ).toThrow();
  });

  it("loại phone rỗng", () => {
    expect(() =>
      createOrderInputSchema.parse({ ...validInput, phone: "" }),
    ).toThrow();
  });

  it("loại ward rỗng", () => {
    expect(() =>
      createOrderInputSchema.parse({ ...validInput, ward: "" }),
    ).toThrow();
  });

  it("loại addressLine rỗng", () => {
    expect(() =>
      createOrderInputSchema.parse({ ...validInput, addressLine: "" }),
    ).toThrow();
  });
});
