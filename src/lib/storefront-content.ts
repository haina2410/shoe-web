export const STORE_INFO = {
  brand: "leafshoes",
  legalName: "CÔNG TY TNHH LEAFSHOES VIỆT NAM",
  businessLine: "Sản xuất giày dép, phụ liệu dép",
  phoneDisplay: "0395.069.089",
  phoneDigits: "0395069089",
  email: "leafshoes.vn@gmail.com",
  address: "Số 14, Đường Phú Sơn 3, Xã Bình Minh, TP. Đồng Nai",
  zaloUrl: "https://zalo.me/0395069089",
} as const;

export const CATEGORY_PATHS = [
  { label: "Sneaker", href: "/products?categorySlug=giay-sneaker" },
  { label: "Chạy bộ", href: "/products?categorySlug=giay-chay-bo" },
  { label: "Sandal", href: "/products?categorySlug=giay-sandal" },
] as const;

export const TRUST_ITEMS = [
  { title: "Thanh toán VietQR", description: "Chuyển khoản đúng mã đơn." },
  { title: "Giao hàng toàn quốc", description: "Phí giao hàng hiển thị rõ." },
  { title: "Hỗ trợ qua Zalo", description: "Liên hệ trực tiếp với cửa hàng." },
] as const;
