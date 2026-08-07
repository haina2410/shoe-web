"use client";

import { useRef, useState, useTransition } from "react";
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog";
import { useAdminToast } from "@/components/admin/admin-toast-provider";
import { useOrderActionGroup } from "@/components/admin/order-action-group";
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
  const actionGroup = useOrderActionGroup();
  const isDisabled = isPending || Boolean(actionGroup?.isLocked);

  function handleClick() {
    if (inFlight.current) return;
    if (actionGroup && !actionGroup.claim()) return;
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
        actionGroup?.release();
        setDialogKey((key) => key + 1);
      }
    });
  }

  return (
    <div className="flex w-full flex-col items-end gap-1 sm:w-auto">
      <ConfirmActionDialog
        key={dialogKey}
        confirmLabel="Xác nhận"
        confirmVariant="warning"
        description="Hệ thống sẽ ghi nhận thanh toán và cập nhật tồn kho theo dữ liệu đơn hàng hiện tại."
        isPending={isDisabled}
        onConfirm={handleClick}
        pendingLabel="Đang xác nhận…"
        subject={`Đơn hàng ${orderCode}`}
        title="Xác nhận thanh toán"
        trigger={
          <Button className="h-10 min-h-10 w-full sm:w-auto" disabled={isDisabled} size="sm" type="button" variant="warning">
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
