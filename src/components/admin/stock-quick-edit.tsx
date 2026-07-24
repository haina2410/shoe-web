"use client";

import { useState, useTransition } from "react";
import { updateVariantStockAction } from "@/server/actions/products";
import { Button } from "@/components/ui/button";

/**
 * Control chỉnh tồn kho nhanh cho một biến thể (variant): input số + nút lưu,
 * gọi `updateVariantStockAction({ variantId, stock })`.
 *
 * Đặt độc lập (chưa gắn vào bảng danh sách): mỗi sản phẩm có thể có nhiều
 * biến thể trong khi bảng danh sách chỉ hiển thị "Tổng tồn" gộp — gắn control
 * theo từng biến thể vào đó không gọn, nên để dành cho trang sửa sản phẩm
 * (Task 6), nơi từng biến thể đã có hàng riêng.
 */
export function StockQuickEdit({
  variantId,
  initialStock,
}: {
  variantId: string;
  initialStock: number;
}) {
  const [stock, setStock] = useState(initialStock);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateVariantStockAction({ variantId, stock });
      if (result && !result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`stock-${variantId}`}>
        Tồn kho
      </label>
      <input
        id={`stock-${variantId}`}
        type="number"
        min={0}
        step={1}
        value={stock}
        onChange={(e) => {
          setSaved(false);
          setStock(Number(e.target.value));
        }}
        className="w-20 rounded-md border px-2 py-1 text-sm outline-none focus:ring-2"
        style={{
          borderColor: "var(--line)",
          backgroundColor: "var(--paper)",
          color: "var(--ink)",
        }}
      />
      <Button type="button" size="xs" onClick={handleSave} disabled={isPending}>
        {isPending ? "Đang lưu…" : "Lưu"}
      </Button>
      {saved && !error && (
        <span className="text-xs" style={{ color: "var(--evergreen)" }}>
          Đã lưu
        </span>
      )}
      {error && (
        <span className="text-xs" style={{ color: "var(--destructive)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
