/** Một dòng giỏ hàng tối thiểu cần để tính tiền (không cần các field khác). */
type CartLine = { unitPrice: number; quantity: number };

/** Tính tổng tiền hàng (chưa gồm phí ship) = Σ(unitPrice × quantity). */
export function cartSubtotal(items: CartLine[]): number {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

/** Tổng tiền đơn hàng = tổng tiền hàng + phí ship. */
export function orderTotal(subtotal: number, shippingFee: number): number {
  return subtotal + shippingFee;
}
