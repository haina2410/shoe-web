import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * `src/lib/cart.ts` — giỏ hàng client-side (Zustand + `persist`/localStorage,
 * key `"leafshoes-cart"`).
 *
 * **Chống hydration mismatch (Next.js App Router):** đã tra cứu docs chính
 * thức pmndrs/zustand qua `ctx7` — `reference/integrations/persisting-store-data.md`,
 * mục "Usage in Next.js". Mặc định `persist` dùng `createJSONStorage(() =>
 * window.localStorage)`; hàm này BẮT LỖI khi `window`/`localStorage` không
 * tồn tại (server) và trả về storage rỗng — nên trên server, store luôn
 * dùng state khởi tạo (`items: []`). Trên client, `persist` rehydrate ĐỒNG BỘ
 * (localStorage là storage đồng bộ) ngay khi module này được import — TRƯỚC
 * cả khi component đầu tiên render. Nếu một component đọc `items` ngay lập
 * tức, HTML server-render (rỗng) và lần render đầu tiên trên client (đã có
 * dữ liệu cũ) sẽ lệch nhau → cảnh báo "Hydration failed…".
 *
 * Giải pháp đúng theo docs (mục "Check Store Hydration Status with
 * onRehydrateStorage"): thêm cờ `hasHydrated`, set `true` trong callback
 * `onRehydrateStorage` (chạy sau khi rehydrate xong, chỉ ở client). Mọi UI
 * đọc `items` (vd. `/cart`) PHẢI chờ `hasHydrated === true` rồi mới render
 * nội dung thật; trước đó hiển thị trạng thái rỗng/placeholder ổn định — khớp
 * cả server lẫn client, không có mismatch dù store thực ra đã có dữ liệu.
 */

export type CartItem = {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  size: string;
  color: string;
  unitPrice: number;
  imageUrl: string | null;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  /** `true` sau khi `persist` đã rehydrate xong từ localStorage (chỉ client). */
  hasHydrated: boolean;
  /** Thêm 1 dòng; nếu đã có `variantId` này thì cộng dồn `quantity` (mặc định +1). */
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  /** Đặt số lượng cho 1 dòng; `quantity <= 0` sẽ xoá dòng đó khỏi giỏ. */
  setQuantity: (variantId: string, quantity: number) => void;
  /** Xoá 1 dòng khỏi giỏ. */
  removeItem: (variantId: string) => void;
  /** Xoá toàn bộ giỏ hàng. */
  clear: () => void;
  setHasHydrated: (value: boolean) => void;
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      hasHydrated: false,

      addItem: (item) =>
        set((state) => {
          const quantityToAdd = item.quantity ?? 1;
          const existing = state.items.find(
            (line) => line.variantId === item.variantId,
          );

          if (existing) {
            return {
              items: state.items.map((line) =>
                line.variantId === item.variantId
                  ? { ...line, quantity: line.quantity + quantityToAdd }
                  : line,
              ),
            };
          }

          return {
            items: [...state.items, { ...item, quantity: quantityToAdd }],
          };
        }),

      setQuantity: (variantId, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((line) => line.variantId !== variantId)
              : state.items.map((line) =>
                  line.variantId === variantId ? { ...line, quantity } : line,
                ),
        })),

      removeItem: (variantId) =>
        set((state) => ({
          items: state.items.filter((line) => line.variantId !== variantId),
        })),

      clear: () => set({ items: [] }),

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "leafshoes-cart",
      partialize: (state) => ({ items: state.items }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
