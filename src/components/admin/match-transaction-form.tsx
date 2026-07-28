"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { matchReviewedTransactionAction } from "@/server/actions/bank-transactions";

const genericError = "Không thể ghép giao dịch lúc này. Vui lòng thử lại.";

export function MatchTransactionForm({
  bankTransactionId,
  initialPaymentCode,
}: {
  bankTransactionId: string;
  initialPaymentCode: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;

    const formData = new FormData(event.currentTarget);
    inFlight.current = true;
    setError(null);

    startTransition(async () => {
      try {
        const result = await matchReviewedTransactionAction({
          bankTransactionId,
          orderCode: String(formData.get("orderCode") ?? ""),
        });

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
    <form aria-label="Ghép giao dịch" className="grid gap-2" onSubmit={handleSubmit}>
      <label className="grid gap-1 text-sm font-medium">
        Mã đơn
        <input
          className="rounded-md border px-3 py-2 font-normal"
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
        <Button className="w-full sm:w-auto" disabled={isPending} size="sm" type="submit">
          {isPending ? "Đang ghép…" : "Ghép giao dịch"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </form>
  );
}
