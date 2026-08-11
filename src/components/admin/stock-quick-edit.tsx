"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAdminToast } from "@/components/admin/admin-toast-provider";
import { AdminSpinner } from "@/components/admin/admin-spinner";
import { updateVariantStockAction } from "@/server/actions/products";
import { Button } from "@/components/ui/button";

const genericError = "Không thể cập nhật tồn kho lúc này. Vui lòng thử lại.";

export function StockQuickEdit({
  variantId,
  initialStock,
}: {
  variantId: string;
  initialStock: number;
}) {
  const router = useRouter();
  const { show } = useAdminToast();
  const [stock, setStock] = useState(initialStock);
  const [expectedStock, setExpectedStock] = useState(initialStock);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);

  function handleSave() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await updateVariantStockAction({
          variantId,
          stock,
          expectedStock,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setExpectedStock(stock);
        setSaved(true);
        show({
          title: "Đã cập nhật tồn kho",
          description: "Tồn kho biến thể đã được lưu.",
          tone: "success",
        });
        router.refresh();
      } catch {
        setError(genericError);
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      <label className="sr-only" htmlFor={`stock-${variantId}`}>
        Tồn kho
      </label>
      <input
        id={`stock-${variantId}`}
        type="number"
        min={0}
        step={1}
        value={stock}
        disabled={isPending}
        onChange={(e) => {
          setSaved(false);
          setStock(Number(e.target.value));
        }}
        className="w-full rounded-md border px-2 py-1 text-sm outline-none focus:ring-2 sm:w-20"
        style={{
          borderColor: "var(--line)",
          backgroundColor: "var(--paper)",
          color: "var(--ink)",
        }}
      />
      <Button className="h-10 min-h-10" type="button" size="xs" onClick={handleSave} disabled={isPending}>
        {isPending ? <><AdminSpinner label="Đang lưu…" /><span aria-hidden="true">Đang lưu…</span></> : "Lưu"}
      </Button>
      {saved && !error && (
        <span className="text-xs" style={{ color: "var(--evergreen)" }}>
          Đã lưu
        </span>
      )}
      {error && (
        <span role="alert" className="text-xs" style={{ color: "var(--destructive)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
