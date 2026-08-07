"use client";

import {
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog";
import { useAdminToast } from "@/components/admin/admin-toast-provider";
import { recordRefundAction } from "@/server/actions/refunds";

const genericError =
  "Không thể ghi nhận hoàn tiền lúc này. Vui lòng thử lại.";

function optionalValue(formData: FormData, name: string): string | undefined {
  const value = String(formData.get(name) ?? "").trim();
  return value || undefined;
}

export function RefundForm({
  orderId,
  orderCode,
}: {
  orderId: string;
  orderCode: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const [input, setInput] = useState<{
    amount: number;
    externalReference?: string;
    note?: string;
  } | null>(null);
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { show: showToast } = useAdminToast();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    setInput({
      amount: Number(formData.get("amount")),
      externalReference: optionalValue(formData, "externalReference"),
      note: optionalValue(formData, "note"),
    });
  }

  function recordRefund() {
    if (inFlight.current || !input) return;

    inFlight.current = true;
    setError(null);

    startTransition(async () => {
      try {
        const result = await recordRefundAction({
          orderId,
          ...input,
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }

        formRef.current?.reset();
        setInput(null);
        showToast({
          title: "Đã ghi nhận hoàn tiền",
          description: `Đơn hàng ${orderCode} sẽ được làm mới.`,
        });
      } catch {
        setError(genericError);
      } finally {
        inFlight.current = false;
        setDialogKey((key) => key + 1);
      }
    });
  }

  return (
    <form
      aria-label="Hoàn tiền"
      className="grid gap-3"
      onSubmit={handleSubmit}
      ref={formRef}
    >
      <label className="grid gap-1 text-sm font-medium">
        Số tiền hoàn
        <input
          className="rounded-md border px-3 py-2 font-normal"
          disabled={isPending}
          min={1}
          name="amount"
          required
          style={{ borderColor: "var(--line)" }}
          type="number"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Mã giao dịch ngân hàng
        <input
          className="rounded-md border px-3 py-2 font-normal"
          disabled={isPending}
          maxLength={120}
          name="externalReference"
          style={{ borderColor: "var(--line)" }}
          type="text"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Ghi chú
        <textarea
          className="rounded-md border px-3 py-2 font-normal"
          disabled={isPending}
          maxLength={500}
          name="note"
          style={{ borderColor: "var(--line)" }}
        />
      </label>
      <div className="flex">
        <ConfirmActionDialog
          key={dialogKey}
          confirmLabel="Xác nhận hoàn tiền"
          confirmVariant="warning"
          description="Khoản hoàn tiền sẽ được ghi vào sổ thanh toán và không thể chỉnh sửa."
          isPending={isPending}
          onConfirm={recordRefund}
          pendingLabel="Đang ghi nhận…"
          subject={`Đơn hàng ${orderCode}`}
          title="Xác nhận hoàn tiền"
          trigger={
            <Button className="w-full sm:w-auto" disabled={isPending} size="sm" type="submit" variant="warning">
              {isPending ? "Đang ghi nhận…" : "Ghi nhận hoàn tiền"}
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
