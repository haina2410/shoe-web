"use client";

import { useRef, useState, useTransition } from "react";
import type { OrderStatus as OrderStatusValue } from "@/generated/prisma/enums";
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
  const inFlight = useRef(false);

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
        }
      } catch {
        setError(genericError);
      } finally {
        inFlight.current = false;
        setActiveTarget(null);
      }
    });
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {targets.map((target) => {
          const label = ACTION_LABEL[target];
          if (!label) return null;

          return (
            <Button
              key={target}
              disabled={isPending}
              onClick={() => updateStatus(target)}
              size="sm"
              type="button"
            >
              {isPending && activeTarget === target ? "Đang cập nhật…" : label}
            </Button>
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
