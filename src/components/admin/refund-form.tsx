"use client";

import {
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import type { PaymentLedgerSummary } from "@/lib/payment-ledger";
import { recordRefundAction } from "@/server/actions/refunds";

const REFUND_LABEL = {
  NONE: "Chưa hoàn tiền",
  PARTIAL: "Hoàn tiền một phần",
  FULL: "Đã hoàn tiền toàn bộ",
} as const;

const genericError =
  "Không thể ghi nhận hoàn tiền lúc này. Vui lòng thử lại.";

function optionalValue(formData: FormData, name: string): string | undefined {
  const value = String(formData.get(name) ?? "").trim();
  return value || undefined;
}

export function RefundForm({ orderId }: { orderId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<PaymentLedgerSummary | null>(null);
  const inFlight = useRef(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    inFlight.current = true;
    setError(null);
    setSummary(null);

    startTransition(async () => {
      try {
        const result = await recordRefundAction({
          orderId,
          amount: Number(formData.get("amount")),
          externalReference: optionalValue(formData, "externalReference"),
          note: optionalValue(formData, "note"),
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }

        form.reset();
        setSummary(result.summary);
      } catch {
        setError(genericError);
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <form
      aria-label="Hoàn tiền"
      className="grid gap-3"
      onSubmit={handleSubmit}
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
        <Button className="w-full sm:w-auto" disabled={isPending} size="sm" type="submit">
          {isPending ? "Đang ghi nhận…" : "Ghi nhận hoàn tiền"}
        </Button>
      </div>
      {summary && (
        <p aria-live="polite" className="text-sm">
          {REFUND_LABEL[summary.refundState]}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </form>
  );
}
