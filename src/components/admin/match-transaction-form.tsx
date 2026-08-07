"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog";
import { useAdminToast } from "@/components/admin/admin-toast-provider";
import { Button } from "@/components/ui/button";
import { matchReviewedTransactionAction } from "@/server/actions/bank-transactions";

const genericError = "Không thể ghép giao dịch lúc này. Vui lòng thử lại.";

export function MatchTransactionForm({
  bankTransactionId,
  initialPaymentCode,
  transactionAmount,
  transactionContent,
}: {
  bankTransactionId: string;
  initialPaymentCode: string | null;
  transactionAmount: string;
  transactionContent: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [orderCode, setOrderCode] = useState<string | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const inFlight = useRef(false);
  const { show: showToast } = useAdminToast();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || isPending) return;

    const formData = new FormData(event.currentTarget);
    setOrderCode(String(formData.get("orderCode") ?? ""));
    setError(null);
  }

  function handleConfirm() {
    if (inFlight.current || !orderCode) return;

    inFlight.current = true;
    setError(null);

    startTransition(async () => {
      try {
        const result = await matchReviewedTransactionAction({
          bankTransactionId,
          orderCode,
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }
        showToast({
          title: "Đã ghép giao dịch",
          description: "Danh sách giao dịch cần đối soát sẽ được làm mới.",
          tone: "success",
        });
      } catch {
        setError(genericError);
      } finally {
        inFlight.current = false;
        setOrderCode(null);
        setDialogKey((key) => key + 1);
      }
    });
  }

  return (
    <form aria-label="Ghép giao dịch" className="grid gap-2" onSubmit={handleSubmit}>
      <label className="grid gap-1 text-sm font-medium">
        Mã đơn
        <input
          className="h-10 min-h-10 rounded-md border px-3 py-2 font-normal"
          defaultValue={initialPaymentCode ?? ""}
          disabled={isPending}
          maxLength={32}
          name="orderCode"
          required
          style={{ borderColor: "var(--line)" }}
          type="text"
        />
      </label>
      <div className="flex">
        <ConfirmActionDialog
          key={dialogKey}
          confirmLabel="Xác nhận ghép"
          confirmVariant="warning"
          description={`Giao dịch có số tiền ${transactionAmount} sẽ được ghép với mã đơn đã nhập.`}
          isPending={isPending}
          onConfirm={handleConfirm}
          pendingLabel="Đang ghép…"
          subject={transactionContent}
          title="Xác nhận ghép giao dịch"
          trigger={
            <Button
              className="h-10 min-h-10 w-full sm:w-auto"
              disabled={isPending}
              size="sm"
              type="submit"
              variant="warning"
            >
              {isPending ? "Đang ghép…" : "Ghép giao dịch"}
            </Button>
          }
        />
      </div>
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </form>
  );
}
