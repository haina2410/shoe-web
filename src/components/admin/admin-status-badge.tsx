import { cn } from "@/lib/utils";

const toneClasses = {
  neutral: "bg-neutral-100 text-neutral-700",
  info: "bg-sky-100 text-sky-800",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-red-100 text-red-800",
  violet: "bg-violet-100 text-violet-800",
} as const;

type AdminStatusBadgeProps = {
  tone: keyof typeof toneClasses;
  children: React.ReactNode;
  className?: string;
};

export function AdminStatusBadge({ tone, children, className }: AdminStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
