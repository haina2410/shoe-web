"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatVnd } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import type { Variant } from "@/generated/prisma/client";

/**
 * `VariantSelector` — chọn size + màu cho trang chi tiết sản phẩm.
 *
 * Client Component: giữ state lựa chọn size/màu, resolve ra variant tương ứng
 * (nếu có) và hiển thị tồn kho. Nút "Thêm vào giỏ" gọi `useCart().addItem`
 * (xem `@/lib/cart`) khi đã chọn được 1 variant còn hàng.
 */
export function VariantSelector({
  variants,
  basePrice,
  productId,
  slug,
  name,
  imageUrl,
}: {
  variants: Variant[];
  basePrice: number;
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
}) {
  const addItem = useCart((state) => state.addItem);

  const sizes = useMemo(
    () => [...new Set(variants.map((v) => v.size))],
    [variants],
  );
  const colors = useMemo(
    () => [...new Set(variants.map((v) => v.color))],
    [variants],
  );

  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  const matchedVariant =
    selectedSize && selectedColor
      ? (variants.find(
          (v) => v.size === selectedSize && v.color === selectedColor,
        ) ?? null)
      : null;

  const effectivePrice =
    matchedVariant?.priceOverride != null
      ? matchedVariant.priceOverride
      : basePrice;

  const canAddToCart = matchedVariant != null && matchedVariant.stock > 0;

  return (
    <div className="mt-6 flex flex-col gap-4">
      <p className="text-xl font-semibold" style={{ color: "var(--evergreen)" }}>
        {formatVnd(effectivePrice)}
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Kích cỡ</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kích cỡ">
          {sizes.map((size) => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={selectedSize === size}
              onClick={() => {
                setSelectedSize(size);
                setJustAdded(false);
              }}
              className="rounded-md border px-3 py-1.5 text-sm"
              style={{
                borderColor: "var(--line)",
                backgroundColor:
                  selectedSize === size ? "var(--evergreen)" : "transparent",
                color: selectedSize === size ? "var(--paper)" : "var(--ink)",
              }}
            >
              {size}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Màu sắc</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Màu sắc">
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={selectedColor === color}
              onClick={() => {
                setSelectedColor(color);
                setJustAdded(false);
              }}
              className="rounded-md border px-3 py-1.5 text-sm"
              style={{
                borderColor: "var(--line)",
                backgroundColor:
                  selectedColor === color ? "var(--evergreen)" : "transparent",
                color: selectedColor === color ? "var(--paper)" : "var(--ink)",
              }}
            >
              {color}
            </button>
          ))}
        </div>
      </fieldset>

      <p className="text-sm font-medium">
        {matchedVariant == null
          ? "Không có lựa chọn này"
          : matchedVariant.stock > 0
            ? `Còn ${matchedVariant.stock} sản phẩm`
            : "Hết hàng"}
      </p>

      <div className="flex flex-col gap-1">
        <Button
          type="button"
          disabled={!canAddToCart}
          className="w-fit"
          onClick={() => {
            if (!matchedVariant || matchedVariant.stock <= 0) return;
            addItem({
              variantId: matchedVariant.id,
              productId,
              slug,
              name,
              size: matchedVariant.size,
              color: matchedVariant.color,
              unitPrice: effectivePrice,
              imageUrl,
            });
            setJustAdded(true);
          }}
        >
          Thêm vào giỏ
        </Button>
        {justAdded && (
          <Link
            href="/cart"
            className="text-xs font-medium underline"
            style={{ color: "var(--evergreen)" }}
          >
            Đã thêm — Xem giỏ hàng
          </Link>
        )}
      </div>
    </div>
  );
}
