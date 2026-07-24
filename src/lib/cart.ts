import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * `src/lib/cart.ts` — giỏ hàng client-side (Zustand + `persist`/localStorage,
 * key `"leafshoes-cart"`).
 *
 * **Chống hydration mismatch (Next.js App Router) — fix review Day 5 Task 4
 * (CRITICAL):** đã tra cứu docs chính thức pmndrs/zustand qua `ctx7` —
 * `reference/integrations/persisting-store-data.md`, mục "Usage in
 * Next.js" — và vendored Next.js docs
 * (`node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`).
 *
 * Mặc định (không có `skipHydration`), `persist` rehydrate ĐỒNG BỘ
 * (localStorage là storage đồng bộ) NGAY KHI module này được `import` — tức
 * là TRƯỚC CẢ lần render đầu tiên của component trên client (React chưa kịp
 * hydrate). Hệ quả: HTML server-render dùng state khởi tạo (`items: []`,
 * `hasHydrated: false`), nhưng lần render đầu tiên trên client đã đọc được
 * `hasHydrated: true` + dữ liệu cũ từ localStorage → cấu trúc DOM lệch nhau
 * ngay từ render đầu tiên → hydration mismatch mỗi lần load `/cart`, không
 * phải chỉ "flash" mà là lỗi thật.
 *
 * Fix: `skipHydration: true` — `persist` KHÔNG tự đọc localStorage lúc module
 * eval nữa. Store luôn khởi tạo `items: []`, `hasHydrated: false` trên cả
 * server lẫn lần render đầu tiên trên client (giống hệt nhau — không mismatch).
 * Rehydrate được trigger thủ công từ `useEffect` (chạy sau lần render đầu,
 * chỉ ở client) qua hook `useCartHydrated()` bên dưới — tương tự kỹ thuật
 * "đọc giá trị client-only sau mount rồi render lại" mà docs Next.js mô tả
 * cho các trường hợp không dùng được inline-script (ở đây không hợp vì
 * localStorage được ghi bởi chính app, không phải theme/locale set trước khi
 * app tồn tại).
 *
 * `hasHydrated` vẫn được set `true` trong `onRehydrateStorage` (chạy sau khi
 * `persist.rehydrate()` hoàn tất). Mọi UI đọc `items` (vd. `/cart`, và sau
 * này `/checkout`) PHẢI dùng `useCartHydrated()` và chờ `true` rồi mới render
 * nội dung thật; trước đó hiển thị placeholder ổn định — khớp cả server lẫn
 * client.
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
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/**
 * Hook dùng chung cho mọi trang đọc giỏ hàng đã persist (`/cart`, và Day 5
 * Task 5's `/checkout`). Trả về `hasHydrated`; lần render ĐẦU TIÊN trên cả
 * server lẫn client luôn là `false` (nhờ `skipHydration: true` ở trên) — nên
 * không có hydration mismatch. Effect chạy sau lần render đầu (chỉ trên
 * client) để trigger rehydrate thật từ localStorage; khi xong,
 * `onRehydrateStorage` set `hasHydrated: true` và component re-render với dữ
 * liệu thật.
 */
export function useCartHydrated(): boolean {
  const hasHydrated = useCart((state) => state.hasHydrated);

  useEffect(() => {
    void useCart.persist.rehydrate();
  }, []);

  return hasHydrated;
}
