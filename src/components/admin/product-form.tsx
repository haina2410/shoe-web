"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { productStatusValues } from "@/lib/validation/product";
import {
  createProductAction,
  updateProductAction,
} from "@/server/actions/products";
import type {
  CreateProductInput,
  UpdateProductInput,
} from "@/lib/validation/product";

/**
 * `ProductForm` — form dùng chung tạo mới / sửa sản phẩm.
 *
 * Biến thể được sửa INLINE (thêm/xoá dòng ngay trong form, state client, tối
 * thiểu 1 dòng — không cho xoá dòng cuối). Ảnh upload thật qua
 * `POST /api/admin/upload` (route handler, không phải Server Action, vì
 * Server Action giới hạn body ~1MB — không đủ cho file ảnh).
 *
 * Theo `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`: gọi
 * một Server Action mà thành công sẽ `redirect()` (ném lỗi control-flow
 * NEXT_REDIRECT) từ trong event handler PHẢI bọc trong `startTransition` để
 * React/Next xử lý đúng — theo đúng idiom đã dùng ở `DeleteProductButton` /
 * `StockQuickEdit`.
 */

export type ProductFormCategory = { id: string; name: string };

export type ProductFormVariant = {
  key: string; // key nội bộ cho React list — KHÔNG gửi lên server
  id?: string; // có id → biến thể đã tồn tại (edit); không có → biến thể mới
  size: string;
  color: string;
  sku: string;
  priceOverride: string; // giữ dạng chuỗi để input điều khiển được, parse lúc submit
  stock: string;
  expectedStock?: number;
};

export type ProductFormImage = {
  key: string;
  url: string;
};

export type ProductFormInitial = {
  product: {
    name: string;
    description: string;
    categoryId: string;
    basePrice: number;
    status: (typeof productStatusValues)[number];
  };
  variants: Array<{
    id: string;
    size: string;
    color: string;
    sku: string;
    priceOverride: number | null;
    stock: number;
  }>;
  images: Array<{ url: string; position: number }>;
};

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `row-${keySeq}`;
}

function emptyVariantRow(): ProductFormVariant {
  return {
    key: nextKey(),
    size: "",
    color: "",
    sku: "",
    priceOverride: "",
    stock: "0",
  };
}

const statusLabel: Record<string, string> = {
  DRAFT: "Nháp",
  ACTIVE: "Đang bán",
  ARCHIVED: "Đã ẩn",
};

export function ProductForm({
  mode,
  productId,
  categories,
  initial,
}: {
  mode: "create" | "edit";
  productId?: string;
  categories: ProductFormCategory[];
  initial?: ProductFormInitial;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.product.name ?? "");
  const [description, setDescription] = useState(
    initial?.product.description ?? "",
  );
  const [categoryId, setCategoryId] = useState(
    initial?.product.categoryId ?? categories[0]?.id ?? "",
  );
  const [basePrice, setBasePrice] = useState(
    initial ? String(initial.product.basePrice) : "",
  );
  const [status, setStatus] = useState<(typeof productStatusValues)[number]>(
    initial?.product.status ?? "DRAFT",
  );

  const [variants, setVariants] = useState<ProductFormVariant[]>(
    initial && initial.variants.length > 0
      ? initial.variants.map((v) => ({
          key: nextKey(),
          id: v.id,
          size: v.size,
          color: v.color,
          sku: v.sku,
          priceOverride: v.priceOverride === null ? "" : String(v.priceOverride),
          stock: String(v.stock),
          expectedStock: v.stock,
        }))
      : [emptyVariantRow()],
  );

  const [images, setImages] = useState<ProductFormImage[]>(
    initial
      ? [...initial.images]
          .sort((a, b) => a.position - b.position)
          .map((img) => ({ key: nextKey(), url: img.url }))
      : [],
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function addVariantRow() {
    setVariants((rows) => [...rows, emptyVariantRow()]);
  }

  function removeVariantRow(key: string) {
    setVariants((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.key !== key)));
  }

  function updateVariantField(
    key: string,
    field: keyof Omit<ProductFormVariant, "key" | "id">,
    value: string,
  ) {
    setVariants((rows) =>
      rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    );
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // cho phép chọn lại cùng 1 file lần nữa
    if (!file) return;

    setUploadError(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : "Tải ảnh lên thất bại.";
        setUploadError(message);
        return;
      }
      const url =
        typeof data === "object" && data !== null && "url" in data
          ? String((data as { url: unknown }).url)
          : null;
      if (!url) {
        setUploadError("Phản hồi tải ảnh không hợp lệ.");
        return;
      }
      setImages((imgs) => [...imgs, { key: nextKey(), url }]);
    } catch {
      setUploadError("Tải ảnh lên thất bại. Vui lòng thử lại.");
    } finally {
      setIsUploading(false);
    }
  }

  function removeImage(key: string) {
    setImages((imgs) => imgs.filter((i) => i.key !== key));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedBasePrice = Number(basePrice);
    const product = {
      name,
      description: description || undefined,
      categoryId,
      basePrice: Number.isFinite(parsedBasePrice) ? Math.round(parsedBasePrice) : 0,
      status,
    };

    const variantsPayload = variants.map((v) => ({
      ...(v.id ? { id: v.id } : {}),
      ...(v.id ? { expectedStock: v.expectedStock } : {}),
      size: v.size,
      color: v.color,
      sku: v.sku,
      priceOverride:
        v.priceOverride.trim() === "" ? null : Math.round(Number(v.priceOverride)),
      stock: Math.round(Number(v.stock) || 0),
    }));

    const imagesPayload = images.map((img, index) => ({
      url: img.url,
      position: index,
    }));

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createProductAction({
              product,
              variants: variantsPayload,
              images: imagesPayload,
            } satisfies CreateProductInput)
          : await updateProductAction(productId as string, {
              product,
              variants: variantsPayload,
              images: imagesPayload,
            } satisfies UpdateProductInput);

      // Thành công → action đã redirect() (ném NEXT_REDIRECT), dòng dưới
      // không chạy tới. Chỉ còn lại khi có lỗi validate.
      if (result && !result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-8">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--evergreen)" }}>
          Thông tin sản phẩm
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Tên sản phẩm
            </label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="categoryId" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Danh mục
            </label>
            <select
              id="categoryId"
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="basePrice" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Giá (VND)
            </label>
            <input
              id="basePrice"
              type="number"
              min={0}
              step={1}
              required
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="status" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Trạng thái
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as (typeof productStatusValues)[number])}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
            >
              {productStatusValues.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s] ?? s}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="description" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Mô tả
            </label>
            <textarea
              id="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: "var(--evergreen)" }}>
            Biến thể
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={addVariantRow}>
            Thêm biến thể
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--line)" }}>
          <table className="w-full min-w-max text-left text-sm" data-testid="variant-table">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--line)" }}>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Màu</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Giá riêng (tuỳ chọn)</th>
                <th className="px-3 py-2 font-medium">Tồn kho</th>
                <th className="px-3 py-2 font-medium">
                  <span className="sr-only">Hành động</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {variants.map((row) => (
                <tr
                  key={row.key}
                  data-testid="variant-row"
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--line)" }}
                >
                  <td className="px-3 py-2">
                    <input
                      required
                      aria-label="Size"
                      value={row.size}
                      onChange={(e) => updateVariantField(row.key, "size", e.target.value)}
                      className="w-20 rounded-md border px-2 py-1 text-sm outline-none focus:ring-2"
                      style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      required
                      aria-label="Màu"
                      value={row.color}
                      onChange={(e) => updateVariantField(row.key, "color", e.target.value)}
                      className="w-24 rounded-md border px-2 py-1 text-sm outline-none focus:ring-2"
                      style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      required
                      aria-label="SKU"
                      value={row.sku}
                      onChange={(e) => updateVariantField(row.key, "sku", e.target.value)}
                      className="w-36 rounded-md border px-2 py-1 text-sm outline-none focus:ring-2"
                      style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      aria-label="Giá riêng"
                      value={row.priceOverride}
                      onChange={(e) => updateVariantField(row.key, "priceOverride", e.target.value)}
                      className="w-28 rounded-md border px-2 py-1 text-sm outline-none focus:ring-2"
                      style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      required
                      aria-label="Tồn kho"
                      value={row.stock}
                      onChange={(e) => updateVariantField(row.key, "stock", e.target.value)}
                      className="w-24 rounded-md border px-2 py-1 text-sm outline-none focus:ring-2"
                      style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="xs"
                      disabled={variants.length <= 1}
                      onClick={() => removeVariantRow(row.key)}
                    >
                      Xoá dòng
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--evergreen)" }}>
          Ảnh sản phẩm
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          {images.map((img) => (
            <div key={img.key} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt=""
                className="h-20 w-20 rounded-md object-cover"
                style={{ backgroundColor: "var(--sage)" }}
              />
              <button
                type="button"
                onClick={() => removeImage(img.key)}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full text-xs"
                style={{ backgroundColor: "var(--destructive)", color: "white" }}
                aria-label="Xoá ảnh"
              >
                ×
              </button>
            </div>
          ))}

          <label
            className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border border-dashed text-xs text-center"
            style={{ borderColor: "var(--line)", color: "var(--muted-foreground)" }}
          >
            {isUploading ? "Đang tải…" : "+ Thêm ảnh"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
              disabled={isUploading}
            />
          </label>
        </div>
        {uploadError && (
          <p className="text-sm" style={{ color: "var(--destructive)" }}>
            {uploadError}
          </p>
        )}
      </section>

      {error && (
        <p className="text-sm" style={{ color: "var(--destructive)" }}>
          Dữ liệu không hợp lệ: {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Đang lưu…" : mode === "create" ? "Tạo sản phẩm" : "Lưu thay đổi"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/admin/products")}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}
