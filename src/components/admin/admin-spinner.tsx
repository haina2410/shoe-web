import { cn } from "@/lib/utils";

type AdminSpinnerProps = {
  className?: string;
  label?: string;
};

export function AdminSpinner({ className, label = "Đang tải" }: AdminSpinnerProps) {
  return (
    <span aria-label={label} className={cn("inline-flex items-center", className)} role="status">
      <span className="admin-spinner size-4 rounded-full border-2 border-current border-r-transparent" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
