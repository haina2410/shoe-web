import type { PrismaClient, Prisma } from "@/generated/prisma/client";

/**
 * `getShippingFee` — tra phí ship theo `province`.
 *
 * Ưu tiên: tỉnh được map tường minh trong `province_zone` → phí zone tương
 * ứng. Nếu tỉnh không có trong bảng (chưa map, hoặc dữ liệu thiếu) → fallback
 * về zone `isDefault`. Nếu không có zone nào (kể cả `isDefault`) → throw, vì
 * đó là lỗi cấu hình dữ liệu (thiếu seed), không nên âm thầm trả phí mặc định.
 *
 * Hiện tại (Ngày 5 Task 2) toàn bộ 34 tỉnh/thành đều map vào MỘT zone đồng
 * giá 30k, nên kết quả thực tế luôn là 30k — nhưng vẫn giữ tra cứu data-driven
 * (không hard-code) để không phải sửa code khi đổi chính sách phí ship.
 *
 * `db` nhận cả `PrismaClient` (gọi độc lập) lẫn `Prisma.TransactionClient`
 * (gọi bên trong `db.$transaction(async (tx) => ...)` ở `createOrderCore`,
 * Ngày 5 Task 3).
 */
export async function getShippingFee(
  db: PrismaClient | Prisma.TransactionClient,
  province: string,
): Promise<number> {
  const provinceZone = await db.provinceZone.findUnique({
    where: { province },
    include: { zone: true },
  });
  if (provinceZone) {
    return provinceZone.zone.fee;
  }

  const defaultZone = await db.shippingZone.findFirst({
    where: { isDefault: true },
  });
  if (defaultZone) {
    return defaultZone.fee;
  }

  throw new Error(
    `Không tìm thấy zone phí ship cho tỉnh "${province}" và không có zone mặc định (isDefault) nào.`,
  );
}
