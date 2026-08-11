import { cn } from "@/lib/utils";

type AdminSectionProps = {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function AdminSection({
  title,
  description,
  action,
  children,
  className,
}: AdminSectionProps) {
  return (
    <section className={cn("rounded-xl border bg-white/70 p-4 sm:p-5", className)}>
      {title || description || action ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title ? <h2 className="font-semibold text-[var(--evergreen)]">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-neutral-600">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
