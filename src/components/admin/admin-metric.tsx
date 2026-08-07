import { cn } from "@/lib/utils";

type AdminMetricProps = {
  label: string;
  value: React.ReactNode;
  description?: string;
  className?: string;
};

export function AdminMetric({ label, value, description, className }: AdminMetricProps) {
  return (
    <div className={cn("rounded-xl border bg-white/70 p-4", className)}>
      <p className="text-sm font-medium text-neutral-600">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[var(--evergreen)]">{value}</p>
      {description ? <p className="mt-1 text-sm text-neutral-500">{description}</p> : null}
    </div>
  );
}
