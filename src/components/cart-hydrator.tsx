"use client";

import { useEffect } from "react";
import { useCart } from "@/lib/cart";

/**
 * `CartHydrator` — rehydrate giỏ hàng (zustand `persist`, `skipHydration:
 * true` — xem `@/lib/cart`) ngay khi app mount, trên MỌI route.
 *
 * Fix follow-up Day 5 Task 4: trước đây chỉ `/cart` (qua `useCartHydrated()`)
 * trigger rehydrate. Trang chi tiết sản phẩm (`/products/[slug]` →
 * `VariantSelector`) không rehydrate gì cả — nếu user quay lại đã có giỏ
 * hàng cũ trong localStorage, mở 1 trang sản phẩm và bấm "Thêm vào giỏ"
 * ngay (trước khi rehydrate xảy ra ở đâu khác), store vẫn đang ở
 * `items: []`. `addItem` cộng dòng mới vào mảng rỗng đó, và `persist` ghi đè
 * `[newItem]` lên `localStorage` — XOÁ MẤT giỏ hàng đã lưu trước đó, mất dữ
 * liệu thật (không phải chỉ lỗi hiển thị).
 *
 * Mount component này 1 lần ở root layout (`src/app/layout.tsx`, Server
 * Component) để bất kể user vào route nào trước, effect dưới đây cũng chạy
 * ngay sau lần render đầu tiên trên client và nạp lại `items` thật từ
 * localStorage TRƯỚC KHI user kịp bấm "Thêm vào giỏ" ở bất kỳ đâu.
 *
 * Component luôn render `null` — không có UI, không gate bất kỳ nội dung
 * nào trên `hasHydrated` (khác với `/cart`, nơi UI thật sự cần đợi dữ liệu
 * đúng trước khi hiển thị). Vì render ra `null` ở cả server lẫn client, và
 * chỉ hành động bên trong `useEffect` (chạy sau lần render đầu, chỉ ở
 * client), nó không tạo thêm khác biệt nào giữa server-render và lần
 * client-render đầu tiên — không có hydration mismatch mới nào bị thêm vào.
 */
export function CartHydrator() {
  useEffect(() => {
    void useCart.persist.rehydrate();
  }, []);

  return null;
}
