"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAdminToast } from "@/components/admin/admin-toast-provider";
import { deleteProductAction } from "@/server/actions/products";
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog";
import { Button } from "@/components/ui/button";

const genericDeleteError = "Không thể xoá sản phẩm lúc này. Vui lòng thử lại.";

export function DeleteProductButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const router = useRouter();
  const { show } = useAdminToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  function handleConfirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteProductAction(productId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        show({
          title: "Đã xoá sản phẩm",
          description: "Sản phẩm đã được xoá khỏi danh mục.",
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
    <div className="flex flex-col items-end gap-1">
      <ConfirmActionDialog
        trigger={
          <Button className="h-10 min-h-10" type="button" variant="destructive" size="sm" disabled={isPending}>
            Xoá
          </Button>
        }
        title="Xoá sản phẩm"
        subject={productName}
        description="Sản phẩm sẽ bị xoá khỏi danh mục và không thể hoàn tác."
        confirmLabel="Xác nhận xoá"
        pendingLabel="Đang xoá…"
        confirmVariant="destructive"
        error={error}
        isPending={isPending}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
