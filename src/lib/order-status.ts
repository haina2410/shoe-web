import { OrderStatus, type OrderStatus as OrderStatusValue } from "@/generated/prisma/enums";

export const ORDER_STATUS_LABEL: Record<OrderStatusValue, string> = {
  [OrderStatus.PENDING_PAYMENT]: "Chờ thanh toán",
  [OrderStatus.PAID]: "Đã thanh toán",
  [OrderStatus.FULFILLED]: "Đang giao",
  [OrderStatus.COMPLETED]: "Hoàn tất",
  [OrderStatus.CANCELLED]: "Đã huỷ",
  [OrderStatus.EXPIRED]: "Đã hết hạn",
};

const ADMIN_TRANSITIONS: Readonly<
  Record<OrderStatusValue, readonly OrderStatusValue[]>
> = Object.freeze({
  [OrderStatus.PENDING_PAYMENT]: Object.freeze([OrderStatus.CANCELLED]),
  [OrderStatus.PAID]: Object.freeze([OrderStatus.FULFILLED]),
  [OrderStatus.FULFILLED]: Object.freeze([OrderStatus.COMPLETED]),
  [OrderStatus.COMPLETED]: Object.freeze([]),
  [OrderStatus.CANCELLED]: Object.freeze([]),
  [OrderStatus.EXPIRED]: Object.freeze([]),
});

export function canTransitionOrder(
  from: OrderStatusValue,
  to: OrderStatusValue,
): boolean {
  return ADMIN_TRANSITIONS[from].includes(to);
}

export function nextOrderStatuses(
  from: OrderStatusValue,
): readonly OrderStatusValue[] {
  return ADMIN_TRANSITIONS[from];
}
