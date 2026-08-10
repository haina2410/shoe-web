"use client";

import { useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { AdminSpinner } from "@/components/admin/admin-spinner";
import { Button } from "@/components/ui/button";

type ConfirmActionDialogProps = {
  trigger: React.ReactElement;
  title: string;
  subject?: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  confirmVariant: "warning" | "destructive";
  isPending: boolean;
  error?: string | null;
  onConfirm: () => void;
};

export function ConfirmActionDialog({
  trigger,
  title,
  subject,
  description,
  confirmLabel,
  pendingLabel,
  confirmVariant,
  isPending,
  error,
  onConfirm,
}: ConfirmActionDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen || !isPending) setOpen(nextOpen);
      }}
    >
      <AlertDialog.Trigger render={trigger} />
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/40 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-xl border bg-white p-5 shadow-xl data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <div>
            <AlertDialog.Title className="text-lg font-bold text-[var(--evergreen)]">
              {title}
            </AlertDialog.Title>
            {subject ? <p className="mt-2 font-medium text-neutral-900">{subject}</p> : null}
            <AlertDialog.Description className="mt-2 text-sm text-neutral-600">
              {description}
            </AlertDialog.Description>
            {error ? <p role="alert" className="mt-2 text-sm text-[var(--destructive)]">{error}</p> : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Close
              render={
                <Button className="h-10 min-h-10 min-w-10" variant="outline">
                  Hủy
                </Button>
              }
              disabled={isPending}
            />
            <Button
              aria-label={isPending ? pendingLabel : undefined}
              className="h-10 min-h-10 min-w-10"
              variant={confirmVariant}
              disabled={isPending}
              onClick={onConfirm}
            >
              {isPending ? <AdminSpinner label={pendingLabel} /> : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
