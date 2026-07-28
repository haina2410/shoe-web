import Link from "next/link";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: {
    href: string;
    label: string;
  };
};

export function EmptyState({ title, description, action }: EmptyStateProps): React.JSX.Element {
  return (
    <section className="mx-auto max-w-xl px-4 py-16 text-center">
      <svg
        aria-hidden="true"
        data-testid="empty-state-leaf"
        viewBox="0 0 64 64"
        className="mx-auto mb-5 h-12 w-12"
      >
        <path
          d="M51 9C29 11 14 23 14 42c0 7 5 13 12 13 19 0 29-19 25-46Z"
          fill="currentColor"
        />
        <path d="M19 48c8-10 16-17 28-25" fill="none" stroke="white" strokeWidth="3" />
      </svg>
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-3 text-neutral-600">{description}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-6 inline-flex rounded-md bg-[var(--evergreen)] px-4 py-2 font-semibold text-[var(--paper)]"
        >
          {action.label}
        </Link>
      ) : null}
    </section>
  );
}
