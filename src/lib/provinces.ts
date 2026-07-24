/**
 * Danh sách 34 tỉnh/thành Việt Nam (sau sáp nhập) — dùng cho form checkout
 * (`province`) và bảng phí ship (Task 2 seed khớp theo đúng chính tả các tên
 * này, đặc biệt `TP. Hồ Chí Minh`, `Đồng Nai`, `Tây Ninh`).
 */
export const PROVINCES = [
  // 6 TP trực thuộc TW
  "Hà Nội",
  "Hải Phòng",
  "Huế",
  "Đà Nẵng",
  "TP. Hồ Chí Minh",
  "Cần Thơ",
  // 28 tỉnh
  "Lai Châu",
  "Điện Biên",
  "Sơn La",
  "Lào Cai",
  "Tuyên Quang",
  "Thái Nguyên",
  "Phú Thọ",
  "Bắc Ninh",
  "Hưng Yên",
  "Ninh Bình",
  "Quảng Ninh",
  "Cao Bằng",
  "Lạng Sơn",
  "Thanh Hóa",
  "Nghệ An",
  "Hà Tĩnh",
  "Quảng Trị",
  "Quảng Ngãi",
  "Gia Lai",
  "Đắk Lắk",
  "Khánh Hòa",
  "Lâm Đồng",
  "Đồng Nai",
  "Tây Ninh",
  "Vĩnh Long",
  "Đồng Tháp",
  "An Giang",
  "Cà Mau",
] as const;

export type Province = (typeof PROVINCES)[number];

/** Kiểm tra `p` có phải 1 trong 34 tỉnh/thành hợp lệ hay không. */
export function isKnownProvince(p: string): p is Province {
  return (PROVINCES as readonly string[]).includes(p);
}
