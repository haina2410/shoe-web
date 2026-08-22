"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog";
import { useAdminToast } from "@/components/admin/admin-toast-provider";
import { Button } from "@/components/ui/button";
import { deleteCategoryAction } from "@/server/actions/categories";

const genericDeleteError = "Không thể xoá danh mục lúc này. Vui lòng thử lại.";

export function DeleteCategoryButton({
  categoryId,
  categoryName,
  productCount,
}: {
  categoryId: string;
  categoryName: string;
  productCount: number;
}) {
  const router = useRouter();
  const { show } = useAdminToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  if (productCount > 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          className="h-10 min-h-10"
          disabled
          size="sm"
          type="button"
          variant="destructive"
        >
          Xoá
        </Button>
        <p className="max-w-44 text-right text-xs text-neutral-600">
          Hãy chuyển hoặc xoá {productCount} sản phẩm trước.
        </p>
      </div>
    );
  }

  function handleConfirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteCategoryAction(categoryId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        show({
          title: "Đã xoá danh mục",
          description: "Danh mục đã được xoá.",
          tone: "success",
        });
        router.refresh();
      } catch {
        setError(genericDeleteError);
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <ConfirmActionDialog
      confirmLabel="Xác nhận xoá"
      confirmVariant="destructive"
      description="Danh mục trống sẽ bị xoá và không thể hoàn tác."
      error={error}
      isPending={isPending}
      onConfirm={handleConfirm}
      pendingLabel="Đang xoá…"
      subject={categoryName}
      title="Xoá danh mục"
      trigger={
        <Button
          className="h-10 min-h-10"
          disabled={isPending}
          size="sm"
          type="button"
          variant="destructive"
        >
          Xoá
        </Button>
      }
    />
  );
}
