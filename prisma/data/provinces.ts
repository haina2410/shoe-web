// Danh sách zone phí ship + tỉnh được map tường minh.
// Quyết định của người dùng (Task 3 brief): 3 tỉnh (TP.HCM, Đồng Nai, Tây Ninh)
// dùng chung zone "TP.HCM & lân cận"; các tỉnh còn lại rơi vào zone isDefault
// (logic tra cứu fallback thuộc Ngày 5 - checkout, không phải Ngày 2).

export const SHIPPING_ZONES = [
  { name: "TP.HCM & lân cận", fee: 25000, isDefault: false },
  { name: "Mặc định (tỉnh khác)", fee: 35000, isDefault: true }, // fallback, KHÔNG gắn tỉnh nào
] as const;

export type ZoneName = (typeof SHIPPING_ZONES)[number]["name"];

// Chỉ 3 tỉnh được map tường minh; còn lại rơi vào zone isDefault (xử lý ở Ngày 5).
export const PROVINCE_ZONES: { province: string; zone: ZoneName }[] = [
  { province: "TP. Hồ Chí Minh", zone: "TP.HCM & lân cận" },
  { province: "Đồng Nai", zone: "TP.HCM & lân cận" },
  { province: "Tây Ninh", zone: "TP.HCM & lân cận" },
];
