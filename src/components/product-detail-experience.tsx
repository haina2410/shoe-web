"use client";

import { useState } from "react";
import type { Variant } from "@/generated/prisma/client";
import {
  ProductGallery,
  selectImageSet,
  type ProductImageSetView,
} from "@/components/product-gallery";
import { VariantSelector } from "@/components/variant-selector";

type ProductDetailView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  categoryName: string;
  basePrice: number;
  variants: Variant[];
  imageSets: ProductImageSetView[];
};

export function ProductDetailExperience({
  product,
}: {
  product: ProductDetailView;
}) {
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const selectedImageSet = selectImageSet(product.imageSets, selectedColor);
  const cartImageUrl = selectedImageSet?.images[0]?.url ?? null;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-12">
      <ProductGallery
        productName={product.name}
        imageSets={product.imageSets}
        selectedColor={selectedColor}
      />

      <div
        className="h-fit rounded-2xl border bg-[var(--paper)] p-5 shadow-sm sm:p-7"
        style={{ borderColor: "var(--line)" }}
      >
        <p
          className="text-sm font-semibold tracking-[0.12em] uppercase"
          style={{ color: "var(--accent)" }}
        >
          {product.categoryName}
        </p>
        <h1
          className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl"
          style={{ color: "var(--evergreen)" }}
        >
          {product.name}
        </h1>

        {product.description && (
          <p className="mt-4 whitespace-pre-line text-neutral-700">
            {product.description}
          </p>
        )}

        <VariantSelector
          variants={product.variants}
          basePrice={product.basePrice}
          productId={product.id}
          slug={product.slug}
          name={product.name}
          imageUrl={cartImageUrl}
          selectedColor={selectedColor}
          onColorChange={setSelectedColor}
        />

        <ul
          className="mt-8 space-y-3 border-t pt-6 text-sm"
          style={{ borderColor: "var(--line)" }}
        >
          <li className="flex gap-3">
            <span aria-hidden="true">✓</span>
            <span>
              <strong>Thanh toán VietQR</strong>
              <br />
              Xác nhận chuyển khoản nhanh chóng.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true">✓</span>
            <span>
              <strong>Giao hàng toàn quốc</strong>
              <br />
              Cửa hàng sẽ liên hệ để xác nhận đơn.
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true">✓</span>
            <span>
              <strong>Hỗ trợ qua Zalo</strong>
              <br />
              Liên hệ cửa hàng khi cần tư vấn hoặc đổi trả.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
