/** Định dạng số nguyên VND (đồng) sang chuỗi hiển thị, VD 250000 -> "250.000 ₫". */
export function formatVnd(amount: number): string {
  const grouped = new Intl.NumberFormat("vi-VN").format(Math.round(amount));
  return `${grouped} ₫`;
}
