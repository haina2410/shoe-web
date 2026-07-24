/**
 * `src/lib/catalog-filters.ts` — nguồn dùng chung UI + query cho lọc catalog.
 *
 * `PRICE_RANGES` là bảng mốc giá CỐ ĐỊNH (khớp brief Ngày 4 Task 2): `min`
 * inclusive, `max` exclusive, `max: null` = không trần (khoảng cuối cùng).
 * UI (bộ lọc giá) và lớp query (`src/server/queries/catalog.ts`) đều import
 * từ đây để không bao giờ lệch nhau.
 */
export type PriceRangeKey = "duoi-500k" | "500k-1tr" | "1tr-1r5" | "tren-1r5";

export type PriceRange = {
  key: PriceRangeKey;
  label: string;
  min: number;
  max: number | null;
};

export const PRICE_RANGES: PriceRange[] = [
  { key: "duoi-500k", label: "Dưới 500k", min: 0, max: 500000 },
  { key: "500k-1tr", label: "500k – 1 triệu", min: 500000, max: 1000000 },
  { key: "1tr-1r5", label: "1 – 1,5 triệu", min: 1000000, max: 1500000 },
  { key: "tren-1r5", label: "Trên 1,5 triệu", min: 1500000, max: null },
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
