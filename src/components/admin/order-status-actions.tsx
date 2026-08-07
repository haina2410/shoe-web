"use client";

import { useRef, useState, useTransition } from "react";
import type { OrderStatus as OrderStatusValue } from "@/generated/prisma/enums";
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog";
import { useAdminToast } from "@/components/admin/admin-toast-provider";
import { Button } from "@/components/ui/button";
import { updateOrderStatusAction } from "@/server/actions/order-status";

const ACTION_LABEL: Partial<Record<OrderStatusValue, string>> = {
  CANCELLED: "Huỷ đơn",
  FULFILLED: "Chuyển sang đang giao",
  COMPLETED: "Đánh dấu hoàn tất",
};

const genericError =
  "Không thể cập nhật trạng thái đơn hàng lúc này. Vui lòng thử lại.";

export function OrderStatusActions({
  orderId,
  targets,
}: {
  orderId: string;
  targets: readonly OrderStatusValue[];
}) {
  const [isPending, startTransition] = useTransition();
  const [activeTarget, setActiveTarget] = useState<OrderStatusValue | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const inFlight = useRef(false);
  const { show: showToast } = useAdminToast();

  function updateStatus(target: OrderStatusValue) {
    if (inFlight.current) return;
    inFlight.current = true;
    setActiveTarget(target);
    setError(null);

    startTransition(async () => {
      try {
        const result = await updateOrderStatusAction(orderId, target);
        if (!result.ok) {
          setError(result.error);
        } else {
          showToast({
            title: "Đã cập nhật trạng thái đơn hàng",
            description: "Thông tin đơn hàng sẽ được làm mới.",
          });
        }
      } catch {
        setError(genericError);
      } finally {
        inFlight.current = false;
        setActiveTarget(null);
        setDialogKey((key) => key + 1);
      }
    });
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {targets.map((target) => {
          const label = ACTION_LABEL[target];
          if (!label) return null;

          const isCancellation = target === "CANCELLED";

          const trigger = (
            <Button
              key={target}
              disabled={isPending}
              size="sm"
              type="button"
              variant={isCancellation ? "destructive" : "default"}
              className="w-full sm:w-auto"
            >
              {isPending && activeTarget === target
                ? target === "CANCELLED"
                  ? "Đang huỷ đơn…"
                  : "Đang cập nhật…"
                : label}
            </Button>
          );

          if (isCancellation) {
            return (
              <ConfirmActionDialog
                key={`${target}-${dialogKey}`}
                confirmLabel="Huỷ đơn hàng"
                confirmVariant="destructive"
                description="Đơn đang chờ thanh toán sẽ bị hủy và không thể khôi phục."
                isPending={isPending}
                onConfirm={() => updateStatus(target)}
                pendingLabel="Đang huỷ đơn…"
                title="Huỷ đơn hàng"
                trigger={trigger}
              />
            );
          }

          return (
            <span key={target}>
              <Button
                disabled={isPending}
                onClick={() => updateStatus(target)}
                size="sm"
                type="button"
                className="w-full sm:w-auto"
              >
                {isPending && activeTarget === target ? "Đang cập nhật…" : label}
              </Button>
            </span>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
