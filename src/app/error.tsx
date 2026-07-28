"use client";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps): React.JSX.Element {
  void error;

  return (
    <section className="mx-auto max-w-xl px-4 py-16 text-center">
      <h2 className="text-2xl font-bold">Có lỗi xảy ra</h2>
      <p className="mt-3 text-neutral-600">Vui lòng thử lại sau ít phút.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-md bg-[var(--evergreen)] px-4 py-2 font-semibold text-[var(--paper)]"
      >
        Thử lại
      </button>
    </section>
  );
}
