import { describe, expect, it } from "vitest";
import { OrderStatus, type OrderStatus as OrderStatusValue } from "@/generated/prisma/enums";
import {
  canTransitionOrder,
  nextOrderStatuses,
  ORDER_STATUS_LABEL,
} from "./order-status";

describe("admin order statuses", () => {
  it.each<[OrderStatusValue, OrderStatusValue, boolean]>([
    [OrderStatus.PENDING_PAYMENT, OrderStatus.PENDING_PAYMENT, false],
    [OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, false],
    [OrderStatus.PENDING_PAYMENT, OrderStatus.FULFILLED, false],
    [OrderStatus.PENDING_PAYMENT, OrderStatus.COMPLETED, false],
    [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED, true],
    [OrderStatus.PENDING_PAYMENT, OrderStatus.EXPIRED, false],
    [OrderStatus.PAID, OrderStatus.PENDING_PAYMENT, false],
    [OrderStatus.PAID, OrderStatus.PAID, false],
    [OrderStatus.PAID, OrderStatus.FULFILLED, true],
    [OrderStatus.PAID, OrderStatus.COMPLETED, false],
    [OrderStatus.PAID, OrderStatus.CANCELLED, false],
    [OrderStatus.PAID, OrderStatus.EXPIRED, false],
    [OrderStatus.FULFILLED, OrderStatus.PENDING_PAYMENT, false],
    [OrderStatus.FULFILLED, OrderStatus.PAID, false],
    [OrderStatus.FULFILLED, OrderStatus.FULFILLED, false],
    [OrderStatus.FULFILLED, OrderStatus.COMPLETED, true],
    [OrderStatus.FULFILLED, OrderStatus.CANCELLED, false],
    [OrderStatus.FULFILLED, OrderStatus.EXPIRED, false],
    [OrderStatus.COMPLETED, OrderStatus.PENDING_PAYMENT, false],
    [OrderStatus.COMPLETED, OrderStatus.PAID, false],
    [OrderStatus.COMPLETED, OrderStatus.FULFILLED, false],
    [OrderStatus.COMPLETED, OrderStatus.COMPLETED, false],
    [OrderStatus.COMPLETED, OrderStatus.CANCELLED, false],
    [OrderStatus.COMPLETED, OrderStatus.EXPIRED, false],
    [OrderStatus.CANCELLED, OrderStatus.PENDING_PAYMENT, false],
    [OrderStatus.CANCELLED, OrderStatus.PAID, false],
    [OrderStatus.CANCELLED, OrderStatus.FULFILLED, false],
    [OrderStatus.CANCELLED, OrderStatus.COMPLETED, false],
    [OrderStatus.CANCELLED, OrderStatus.CANCELLED, false],
    [OrderStatus.CANCELLED, OrderStatus.EXPIRED, false],
    [OrderStatus.EXPIRED, OrderStatus.PENDING_PAYMENT, false],
    [OrderStatus.EXPIRED, OrderStatus.PAID, false],
    [OrderStatus.EXPIRED, OrderStatus.FULFILLED, false],
    [OrderStatus.EXPIRED, OrderStatus.COMPLETED, false],
    [OrderStatus.EXPIRED, OrderStatus.CANCELLED, false],
    [OrderStatus.EXPIRED, OrderStatus.EXPIRED, false],
  ])("allows %s -> %s: %s", (from, to, expected) => {
    expect(canTransitionOrder(from, to)).toBe(expected);
  });

  it.each<[OrderStatusValue, readonly OrderStatusValue[]]>([
    [OrderStatus.PENDING_PAYMENT, [OrderStatus.CANCELLED]],
    [OrderStatus.PAID, [OrderStatus.FULFILLED]],
    [OrderStatus.FULFILLED, [OrderStatus.COMPLETED]],
    [OrderStatus.COMPLETED, []],
    [OrderStatus.CANCELLED, []],
    [OrderStatus.EXPIRED, []],
  ])("lists the allowed admin targets from %s", (from, expected) => {
    expect(nextOrderStatuses(from)).toEqual(expected);
  });

  it("provides Vietnamese labels for every order status", () => {
    expect(ORDER_STATUS_LABEL).toEqual({
      PENDING_PAYMENT: "Chờ thanh toán",
      PAID: "Đã thanh toán",
      FULFILLED: "Đang giao",
      COMPLETED: "Hoàn tất",
      CANCELLED: "Đã huỷ",
      EXPIRED: "Đã hết hạn",
    });
  });
});
