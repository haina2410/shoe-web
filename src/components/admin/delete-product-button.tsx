"use client";

import { useState, useTransition } from "react";
import { deleteProductAction } from "@/server/actions/products";
import { Button } from "@/components/ui/button";

/**
 * Nút xoá sản phẩm trong danh sách admin.
 *
 * `deleteProductAction` là Server Action: khi thành công nó gọi `redirect()`
 * (ném lỗi control-flow `NEXT_REDIRECT`) — theo
 * `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, gọi Server
 * Action từ event handler PHẢI bọc trong `startTransition` để framework xử lý
 * đúng chuyển hướng/re-render; chỉ trả `{ ok: false, error }` khi input không hợp lệ.
 *
 * Xác nhận bằng `confirm()` gốc của trình duyệt trước khi gọi action, tránh
 * xoá nhầm do click lỡ tay.
 */
export function DeleteProductButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    const confirmed = window.confirm(
      `Xoá sản phẩm "${productName}"? Hành động này không thể hoàn tác.`,
    );
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteProductAction(productId);
      // Thành công → action đã redirect() (ném NEXT_REDIRECT), dòng dưới
      // không chạy tới. Chỉ còn lại khi có lỗi validate.
      if (result && !result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Đang xoá…" : "Xoá"}
      </Button>
      {error && (
        <span className="text-xs" style={{ color: "var(--destructive)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
