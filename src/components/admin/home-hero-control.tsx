"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAdminToast } from "@/components/admin/admin-toast-provider";
import { setHomeHeroProductAction } from "@/server/actions/storefront";

export function HomeHeroControl({
  productId,
  isSelected,
  canSelect,
}: {
  productId: string;
  isSelected: boolean;
  canSelect: boolean;
}) {
  const router = useRouter();
  const { show } = useAdminToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  function handleClick() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await setHomeHeroProductAction(
          isSelected ? null : productId,
        );
        if (!result.ok) {
          setError(result.error);
          return;
        }
        show({
          title: isSelected
            ? "Đã bật lựa chọn tự động"
            : "Đã chọn banner trang chủ",
          tone: "success",
        });
        router.refresh();
      } catch {
        setError("Không thể cập nhật banner lúc này. Vui lòng thử lại.");
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">
        {isSelected
          ? canSelect
            ? "Sản phẩm này đã được chọn cho banner trang chủ."
            : "Sản phẩm đã được chọn nhưng chỉ hiển thị khi đang bán và có ảnh."
          : canSelect
            ? "Chọn sản phẩm này để hiển thị ảnh và liên kết trên trang chủ."
            : "Hãy lưu sản phẩm ở trạng thái Đang bán và có ảnh trước khi chọn."}
      </p>
      <Button
        type="button"
        variant={isSelected ? "outline" : "default"}
        disabled={isPending || (!isSelected && !canSelect)}
        onClick={handleClick}
      >
        {isSelected ? "Dùng lựa chọn tự động" : "Dùng làm banner trang chủ"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
