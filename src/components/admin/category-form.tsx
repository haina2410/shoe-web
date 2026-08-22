"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminSpinner } from "@/components/admin/admin-spinner";
import { useAdminToast } from "@/components/admin/admin-toast-provider";
import { Button } from "@/components/ui/button";
import {
  createCategoryAction,
  updateCategoryAction,
} from "@/server/actions/categories";

const genericSaveError = "Không thể lưu danh mục lúc này. Vui lòng thử lại.";

export function CategoryForm({
  mode,
  categoryId,
  initialName = "",
}: {
  mode: "create" | "edit";
  categoryId?: string;
  initialName?: string;
}) {
  const router = useRouter();
  const { show } = useAdminToast();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inFlight = useRef(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);

    startTransition(async () => {
      try {
        const result = mode === "create"
          ? await createCategoryAction({ name })
          : await updateCategoryAction(categoryId as string, { name });

        if (!result.ok) {
          setError(result.error);
          return;
        }

        show({
          title: mode === "create" ? "Đã tạo danh mục" : "Đã lưu thay đổi",
          description: "Danh mục đã được lưu.",
          tone: "success",
        });
        router.push("/admin/categories");
      } catch {
        setError(genericSaveError);
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <form
      aria-label="Thông tin danh mục"
      className="space-y-5"
      onSubmit={handleSubmit}
    >
      <div className="space-y-1.5">
        <label htmlFor="category-name" className="text-sm font-medium text-[var(--ink)]">
          Tên danh mục
        </label>
        <input
          autoFocus
          className="w-full rounded-lg border bg-[var(--paper)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none focus:ring-2"
          disabled={isPending}
          id="category-name"
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <Button className="h-10 min-h-10" disabled={isPending} type="submit">
        {isPending ? <AdminSpinner /> : null}
        {isPending
          ? "Đang lưu…"
          : mode === "create"
            ? "Tạo danh mục"
            : "Lưu thay đổi"}
      </Button>
    </form>
  );
}
