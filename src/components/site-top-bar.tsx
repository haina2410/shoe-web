import { STORE_INFO } from "@/lib/storefront-content";

export function SiteTopBar() {
  return (
    <div
      className="text-xs sm:text-[0.8125rem]"
      data-testid="site-top-bar"
      style={{ backgroundColor: "var(--evergreen)", color: "var(--paper)" }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-5 px-4 sm:justify-between">
        <p className="hidden sm:block">{STORE_INFO.address}</p>

        <div className="flex items-center gap-x-5">
          <a
            className="inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline"
            href={`tel:${STORE_INFO.phoneDigits}`}
          >
            {STORE_INFO.phoneDisplay}
          </a>
          <a
            className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            href={STORE_INFO.facebookUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Facebook fanpage
          </a>
        </div>
      </div>
    </div>
  );
}
