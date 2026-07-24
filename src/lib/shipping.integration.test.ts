import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, resetDb } from "@/test/db";
import { getShippingFee } from "./shipping";

/**
 * `src/lib/shipping.integration.test.ts` — integration test cho resolver phí
 * ship (`getShippingFee`), test bằng `testPrisma` (Postgres thật, xem
 * `src/test/db.ts`).
 *
 * QUAN TRỌNG: `resetDb()` TRUNCATE cả `province_zone` lẫn `shipping_zone` —
 * KHÔNG dựa vào dữ liệu seed, mỗi test tự tạo fixture zone + tỉnh riêng.
 */

async function makeZone(opts: { name: string; fee: number; isDefault?: boolean }) {
  return testPrisma.shippingZone.create({
    data: { name: opts.name, fee: opts.fee, isDefault: opts.isDefault ?? false },
  });
}

describe("getShippingFee", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("tỉnh được map tường minh → trả đúng phí zone của tỉnh đó", async () => {
    const zone = await makeZone({ name: "Giao hàng toàn quốc", fee: 30000, isDefault: true });
    await testPrisma.provinceZone.create({
      data: { province: "Hà Nội", zoneId: zone.id },
    });

    const fee = await getShippingFee(testPrisma, "Hà Nội");

    expect(fee).toBe(30000);
  });

  it("tỉnh KHÔNG có trong bảng province_zone → fallback về zone isDefault", async () => {
    await makeZone({ name: "Giao hàng toàn quốc", fee: 30000, isDefault: true });
    // Không tạo provinceZone nào cho "Cần Thơ".

    const fee = await getShippingFee(testPrisma, "Cần Thơ");

    expect(fee).toBe(30000);
  });

  it("không có zone nào (kể cả isDefault) → throw", async () => {
    await expect(getShippingFee(testPrisma, "Hà Nội")).rejects.toThrow();
  });
});
