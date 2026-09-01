/**
 * `src/lib/catalog-filters.ts` — nguồn dùng chung UI + query cho lọc catalog.
 *
 * `PRICE_RANGES` là bảng mốc giá CỐ ĐỊNH (khớp brief Ngày 4 Task 2): `min`
 * inclusive, `max` exclusive, `max: null` = không trần (khoảng cuối cùng).
 * UI (bộ lọc giá) và lớp query (`src/server/queries/catalog.ts`) đều import
 * từ đây để không bao giờ lệch nhau.
 */
export type PriceRangeKey = "duoi-300k" | "300k-500k" | "500k-800k" | "tren-800k";

export type PriceRange = {
  key: PriceRangeKey;
  label: string;
  min: number;
  max: number | null;
};

export const PRICE_RANGES: PriceRange[] = [
  { key: "duoi-300k", label: "Dưới 300k", min: 0, max: 300000 },
  { key: "300k-500k", label: "300k – 500k", min: 300000, max: 500000 },
  { key: "500k-800k", label: "500k – 800k", min: 500000, max: 800000 },
  { key: "tren-800k", label: "Trên 800k", min: 800000, max: null },
];

/** Các kiểu sắp xếp hợp lệ cho danh sách sản phẩm. `moi-nhat` là mặc định. */
export type CatalogSort = "moi-nhat" | "gia-tang" | "gia-giam";

/**
 * Tham số truy vấn catalog (lọc + tìm kiếm + sắp xếp) — dùng chung giữa
 * `listProducts` và các nơi build query từ URL search params (Task 3).
 */
export type CatalogQuery = {
  categorySlug?: string;
  sizes?: string[];
  colors?: string[];
  priceKeys?: string[];
  q?: string;
  sort?: CatalogSort;
};
