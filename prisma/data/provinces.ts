// Danh sách zone phí ship + tỉnh được map.
// Quyết định của người dùng (Ngày 5 Task 2): bỏ scheme 3-tỉnh/2-zone cũ
// (TP.HCM & lân cận 25k / Mặc định 35k). Thay bằng MỘT zone phí ship đồng giá
// 30k áp dụng cho TOÀN QUỐC — map tường minh cả 34 tỉnh/thành (từ
// `src/lib/provinces.ts`) vào zone này, `isDefault` vẫn giữ vai trò fallback
// an toàn (logic tra cứu ở `src/lib/shipping.ts`, không phải Ngày 2).

import { PROVINCES } from "../../src/lib/provinces";

export const SHIPPING_ZONES = [
  { name: "Giao hàng toàn quốc", fee: 30000, isDefault: true },
] as const;

export type ZoneName = (typeof SHIPPING_ZONES)[number]["name"];

// Toàn bộ 34 tỉnh/thành đều map vào zone đồng giá toàn quốc.
export const PROVINCE_ZONES: { province: string; zone: ZoneName }[] =
  PROVINCES.map((province) => ({
    province,
    zone: "Giao hàng toàn quốc" as ZoneName,
  }));
