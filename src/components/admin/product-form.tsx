"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import Image from "next/image";
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

export type ProductFormImageSet = {
  key: string;
  color: string;
  isDefault: boolean;
  images: ProductFormImage[];
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
  imageSets: Array<{
    color: string;
    position: number;
    isDefault: boolean;
    images: Array<{ url: string; position: number }>;
  }>;
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

const genericSaveError = "Không thể lưu sản phẩm lúc này. Vui lòng thử lại.";

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

  const [imageSets, setImageSets] = useState<ProductFormImageSet[]>(
    initial
      ? [...initial.imageSets]
          .sort((a, b) => a.position - b.position)
          .map((imageSet) => ({
            key: nextKey(),
            color: imageSet.color,
            isDefault: imageSet.isDefault,
            images: [...imageSet.images]
              .sort((a, b) => a.position - b.position)
              .map((image) => ({ key: nextKey(), url: image.url })),
          }))
      : [],
  );
  const [uploadingSetKey, setUploadingSetKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<{
    setKey: string;
    message: string;
  } | null>(null);
  const variantColors = [
    ...new Set(variants.map((variant) => variant.color.trim()).filter(Boolean)),
  ];
  const availableColors = variantColors.filter(
    (color) => !imageSets.some((imageSet) => imageSet.color === color),
  );
  const isUploading = uploadingSetKey !== null;
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

  function addImageSet() {
    if (isLocked || availableColors.length === 0) return;
    setImageSets((sets) => [
      ...sets,
      {
        key: nextKey(),
        color: availableColors[0],
        isDefault: false,
        images: [],
      },
    ]);
  }

  function removeImageSet(key: string) {
    if (isLocked) return;
    setImageSets((sets) => sets.filter((imageSet) => imageSet.key !== key));
  }

  function updateImageSetColor(key: string, color: string) {
    if (isLocked) return;
    setImageSets((sets) =>
      sets.map((imageSet) =>
        imageSet.key === key ? { ...imageSet, color } : imageSet,
      ),
    );
  }

  function setDefaultImageSet(key: string) {
    if (isLocked) return;
    setImageSets((sets) =>
      sets.map((imageSet) => ({
        ...imageSet,
        isDefault: imageSet.key === key,
      })),
    );
  }

  async function handleFileChange(
    setKey: string,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    if (isPending) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadError(null);
    setUploadingSetKey(setKey);
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
        setUploadError({ setKey, message });
        return;
      }
      const url =
        typeof data === "object" && data !== null && "url" in data
          ? String((data as { url: unknown }).url)
          : null;
      if (!url) {
        setUploadError({
          setKey,
          message: "Phản hồi tải ảnh không hợp lệ.",
        });
        return;
      }
      setImageSets((sets) =>
        sets.map((imageSet) =>
          imageSet.key === setKey
            ? {
                ...imageSet,
                images: [...imageSet.images, { key: nextKey(), url }],
              }
            : imageSet,
        ),
      );
      show({
        title: "Đã tải ảnh lên",
        description: "Ảnh đã được thêm vào sản phẩm.",
        tone: "success",
      });
    } catch {
      setUploadError({
        setKey,
        message: "Tải ảnh lên thất bại. Vui lòng thử lại.",
      });
    } finally {
      setUploadingSetKey(null);
    }
  }

  function removeImage(setKey: string, imageKey: string) {
    if (isLocked) return;
    setImageSets((sets) =>
      sets.map((imageSet) =>
        imageSet.key === setKey
          ? {
              ...imageSet,
              images: imageSet.images.filter((image) => image.key !== imageKey),
            }
          : imageSet,
      ),
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || isUploading) return;
    setError(null);

    if (imageSets.some((imageSet) => !variantColors.includes(imageSet.color))) {
      setError("Hãy gán lại hoặc xoá bộ ảnh có màu không còn trong biến thể.");
      return;
    }
    if (imageSets.some((imageSet) => imageSet.images.length === 0)) {
      setError("Mỗi bộ ảnh phải có ít nhất một ảnh.");
      return;
    }
    if (
      imageSets.length > 0 &&
      imageSets.filter((imageSet) => imageSet.isDefault).length !== 1
    ) {
      setError("Hãy chọn đúng một bộ ảnh mặc định.");
      return;
    }

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

    const imageSetsPayload = imageSets.map((imageSet, position) => ({
      color: imageSet.color,
      position,
      isDefault: imageSet.isDefault,
      images: imageSet.images.map((image, imagePosition) => ({
        url: image.url,
        position: imagePosition,
      })),
    }));

    inFlight.current = true;
    startTransition(async () => {
      try {
        const result =
          mode === "create"
            ? await createProductAction({
                product,
                variants: variantsPayload,
                imageSets: imageSetsPayload,
              } satisfies CreateProductInput)
            : await updateProductAction(productId as string, {
                product,
                variants: variantsPayload,
                imageSets: imageSetsPayload,
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
      } catch {
        setError(genericSaveError);
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
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: "var(--evergreen)" }}>
              Bộ ảnh theo màu
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Chọn màu từ danh sách biến thể và chỉ định một bộ mặc định.
            </p>
          </div>
          <Button
            className="h-10 min-h-10"
            type="button"
            variant="outline"
            size="sm"
            onClick={addImageSet}
            disabled={isLocked || availableColors.length === 0}
          >
            Thêm bộ ảnh
          </Button>
        </div>

        <div className="space-y-4">
          {imageSets.map((imageSet) => {
            const selectableColors = variantColors.filter(
              (color) =>
                color === imageSet.color ||
                !imageSets.some((candidate) => candidate.color === color),
            );

            return (
              <div
                key={imageSet.key}
                data-testid="image-set-panel"
                className="rounded-lg border p-4"
                style={{ borderColor: "var(--line)" }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        Màu bộ ảnh
                        <select
                          aria-label="Màu bộ ảnh"
                          value={imageSet.color}
                          disabled={isLocked}
                          onChange={(event) =>
                            updateImageSetColor(imageSet.key, event.target.value)
                          }
                          className="mt-1 block rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                          style={{
                            borderColor: "var(--line)",
                            backgroundColor: "var(--paper)",
                            color: "var(--ink)",
                          }}
                        >
                          {!variantColors.includes(imageSet.color) && (
                            <option value={imageSet.color}>{imageSet.color}</option>
                          )}
                          {selectableColors.map((color) => (
                            <option key={color} value={color}>
                              {color}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
                      <input
                        type="radio"
                        name="default-image-set"
                        checked={imageSet.isDefault}
                        disabled={isLocked}
                        onChange={() => setDefaultImageSet(imageSet.key)}
                      />
                      Bộ mặc định
                    </label>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="xs"
                    disabled={isLocked}
                    onClick={() => removeImageSet(imageSet.key)}
                  >
                    Xoá bộ ảnh
                  </Button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {imageSet.images.map((image) => (
                    <div key={image.key} className="relative">
                      <Image
                        src={image.url}
                        alt=""
                        width={80}
                        height={80}
                        unoptimized={image.url.startsWith("/api/uploads/") || image.url.startsWith("/uploads/")}
                        className="h-20 w-20 rounded-md object-cover"
                        style={{ backgroundColor: "var(--sage)" }}
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(imageSet.key, image.key)}
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
                    className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border border-dashed text-center text-xs"
                    style={{ borderColor: "var(--line)", color: "var(--muted-foreground)" }}
                  >
                    {uploadingSetKey === imageSet.key ? (
                      <>
                        <AdminSpinner label="Đang tải ảnh…" />
                        <span aria-hidden="true">Đang tải ảnh…</span>
                      </>
                    ) : (
                      "+ Thêm ảnh"
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-label={`Thêm ảnh cho bộ ${imageSet.color}`}
                      className="hidden"
                      onChange={(event) => handleFileChange(imageSet.key, event)}
                      disabled={isLocked}
                    />
                  </label>
                </div>
                {uploadError?.setKey === imageSet.key && (
                  <p role="alert" className="mt-3 text-sm" style={{ color: "var(--destructive)" }}>
                    {uploadError.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
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
