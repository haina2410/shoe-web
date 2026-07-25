"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { confirmPaymentManuallyAction } from "@/server/actions/payments";

const genericError =
  "Không thể xác nhận thanh toán lúc này. Vui lòng thử lại.";

export function ConfirmPaymentButton({ orderId }: { orderId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  function handleClick() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);

    startTransition(async () => {
      try {
        const result = await confirmPaymentManuallyAction(orderId);
        if (!result.ok) {
          setError(result.error);
        }
      } catch {
        setError(genericError);
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Đang xác nhận…" : "Xác nhận thanh toán"}
      </Button>
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
