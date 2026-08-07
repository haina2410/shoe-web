"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useAdminToast } from "@/components/admin/admin-toast-provider";
import { AdminSpinner } from "@/components/admin/admin-spinner";
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

export type ProductFormCategory = { id: string; name: string };

export type ProductFormVariant = {
  key: string;
  id?: string;
  size: string;
  color: string;
  sku: string;
  priceOverride: string;
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
  const { show } = useAdminToast();
  const [isPending, startTransition] = useTransition();
  const inFlight = useRef(false);
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
  const isLocked = isPending || isUploading;

  function addVariantRow() {
    if (isLocked) return;
    setVariants((rows) => [...rows, emptyVariantRow()]);
  }

  function removeVariantRow(key: string) {
    if (isLocked) return;
    setVariants((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.key !== key)));
  }

  function updateVariantField(
    key: string,
    field: keyof Omit<ProductFormVariant, "key" | "id">,
    value: string,
  ) {
    if (isLocked) return;
    setVariants((rows) =>
      rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    );
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (isPending) return;
    const file = event.target.files?.[0];
    event.target.value = "";
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
    if (isLocked) return;
    setImages((imgs) => imgs.filter((i) => i.key !== key));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || isUploading) return;
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

    inFlight.current = true;
    startTransition(async () => {
      try {
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

        if (!result.ok) {
          setError(result.error);
          return;
        }

        show({
          title: mode === "create" ? "Đã tạo sản phẩm" : "Đã lưu thay đổi",
          description: "Sản phẩm đã được lưu.",
          tone: "success",
        });
        router.push("/admin/products");
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <form aria-label="Thông tin sản phẩm" onSubmit={handleSubmit} className="mt-6 space-y-6 sm:space-y-8">
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
              disabled={isLocked}
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
              disabled={isLocked}
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
              disabled={isLocked}
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
              disabled={isLocked}
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
              disabled={isLocked}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <h2 className="text-lg font-semibold" style={{ color: "var(--evergreen)" }}>
            Biến thể
          </h2>
          <Button className="h-10 min-h-10" type="button" variant="outline" size="sm" onClick={addVariantRow} disabled={isLocked}>
            Thêm biến thể
          </Button>
        </div>

        <div
          aria-label="Danh sách biến thể"
          className="overflow-x-auto rounded-lg border"
          role="region"
          style={{ borderColor: "var(--line)" }}
        >
          <table className="w-full min-w-max text-left text-sm" data-testid="variant-table">
            <thead>
              <tr className="border-b bg-neutral-50 text-xs font-semibold tracking-wide text-neutral-700 uppercase" style={{ borderColor: "var(--line)" }}>
                <th className="px-3 py-3">Size</th>
                <th className="px-3 py-3">Màu</th>
                <th className="px-3 py-3">SKU</th>
                <th className="px-3 py-3">Giá riêng (tuỳ chọn)</th>
                <th className="px-3 py-3">Tồn kho</th>
                <th className="px-3 py-3">
                  <span className="sr-only">Hành động</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {variants.map((row) => (
                <tr
                  key={row.key}
                  data-testid="variant-row"
                  className="border-b transition-colors hover:bg-neutral-50 focus-within:bg-neutral-50 last:border-0"
                  style={{ borderColor: "var(--line)" }}
                >
                  <td className="px-3 py-3">
                    <input
                      required
                      disabled={isLocked}
                      aria-label="Size"
                      value={row.size}
                      onChange={(e) => updateVariantField(row.key, "size", e.target.value)}
                      className="w-20 rounded-md border px-2 py-1 text-sm outline-none focus:ring-2"
                      style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      required
                      disabled={isLocked}
                      aria-label="Màu"
                      value={row.color}
                      onChange={(e) => updateVariantField(row.key, "color", e.target.value)}
                      className="w-24 rounded-md border px-2 py-1 text-sm outline-none focus:ring-2"
                      style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      required
                      disabled={isLocked}
                      aria-label="SKU"
                      value={row.sku}
                      onChange={(e) => updateVariantField(row.key, "sku", e.target.value)}
                      className="w-36 rounded-md border px-2 py-1 text-sm outline-none focus:ring-2"
                      style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      aria-label="Giá riêng"
                      disabled={isLocked}
                      value={row.priceOverride}
                      onChange={(e) => updateVariantField(row.key, "priceOverride", e.target.value)}
                      className="w-28 rounded-md border px-2 py-1 text-sm outline-none focus:ring-2"
                      style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      required
                      aria-label="Tồn kho"
                      disabled={isLocked}
                      value={row.stock}
                      onChange={(e) => updateVariantField(row.key, "stock", e.target.value)}
                      className="w-24 rounded-md border px-2 py-1 text-sm outline-none focus:ring-2"
                      style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      type="button"
                      variant="destructive"
                      size="xs"
                      disabled={isLocked || variants.length <= 1}
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
                disabled={isLocked}
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
              disabled={isLocked}
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
        <p role="alert" className="text-sm" style={{ color: "var(--destructive)" }}>
          Dữ liệu không hợp lệ: {error}
        </p>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center">
        <Button className="h-10 min-h-10 w-full sm:w-auto" type="submit" disabled={isLocked}>
          {isPending ? <><AdminSpinner label="Đang lưu…" /><span aria-hidden="true">Đang lưu…</span></> : mode === "create" ? "Tạo sản phẩm" : "Lưu thay đổi"}
        </Button>
        <Button
          className="w-full sm:w-auto"
          type="button"
          variant="outline"
          disabled={isLocked}
          onClick={() => router.push("/admin/products")}
        >
          Huỷ
        </Button>
      </div>
    </form>
  );
}
