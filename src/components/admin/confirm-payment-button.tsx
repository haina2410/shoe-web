"use client";

import { useRef, useState, useTransition } from "react";
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog";
import { useAdminToast } from "@/components/admin/admin-toast-provider";
import { Button } from "@/components/ui/button";
import { confirmPaymentManuallyAction } from "@/server/actions/payments";

const genericError =
  "Không thể xác nhận thanh toán lúc này. Vui lòng thử lại.";

export function ConfirmPaymentButton({
  orderId,
  orderCode,
}: {
  orderId: string;
  orderCode: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const inFlight = useRef(false);
  const { show: showToast } = useAdminToast();

  function handleClick() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);

    startTransition(async () => {
      try {
        const result = await confirmPaymentManuallyAction(orderId);
        if (!result.ok) {
          setError(result.error);
        } else {
          showToast({
            title: "Đã xác nhận thanh toán",
            description: `Đơn hàng ${orderCode} sẽ được làm mới.`,
          });
        }
      } catch {
        setError(genericError);
      } finally {
        inFlight.current = false;
        setDialogKey((key) => key + 1);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <ConfirmActionDialog
        key={dialogKey}
        confirmLabel="Xác nhận"
        confirmVariant="warning"
        description="Hệ thống sẽ ghi nhận thanh toán và cập nhật tồn kho theo dữ liệu đơn hàng hiện tại."
        isPending={isPending}
        onConfirm={handleClick}
        pendingLabel="Đang xác nhận…"
        subject={`Đơn hàng ${orderCode}`}
        title="Xác nhận thanh toán"
        trigger={
          <Button disabled={isPending} size="sm" type="button" variant="warning">
            Xác nhận thanh toán
          </Button>
        }
      />
      {error && (
        <span
          role="alert"
          className="max-w-xs text-right text-xs"
          style={{ color: "var(--destructive)" }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
