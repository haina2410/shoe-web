import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { COMPANY_NAV, COMPANY_NAV_LABEL } from "@/lib/company-content";
import type { ContentNavItem } from "@/lib/content-page";
import { POLICY_NAV, POLICY_NAV_LABEL } from "@/lib/policy-content";
import { STORE_INFO } from "@/lib/storefront-content";

const SHOP_NAV: readonly ContentNavItem[] = [
  { label: "Sản phẩm", href: "/products" },
  { label: "Giỏ hàng", href: "/cart" },
];

/** Một cột liên kết ở chân trang; `title` cũng là tên của vùng điều hướng. */
function FooterNav({ title, items }: { title: string; items: readonly ContentNavItem[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="font-semibold text-neutral-900">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link className="hover:text-[var(--evergreen)]" href={item.href}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t" style={{ borderColor: "var(--line)" }}>
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-neutral-600">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <section>
            <BrandMark />
            <p className="mt-4 font-semibold text-neutral-900">{STORE_INFO.legalName}</p>
            <p className="mt-1">{STORE_INFO.businessLine}</p>
          </section>

          <section aria-labelledby="footer-contact">
            <h2 id="footer-contact" className="font-semibold text-neutral-900">
              Liên hệ
            </h2>
            <address className="mt-3 space-y-2 not-italic">
              <p>{STORE_INFO.address}</p>
              <p>
                <a className="hover:text-[var(--evergreen)]" href={`tel:${STORE_INFO.phoneDigits}`}>
                  {STORE_INFO.phoneDisplay}
                </a>
              </p>
              <p>
                <a className="hover:text-[var(--evergreen)]" href={`mailto:${STORE_INFO.email}`}>
                  {STORE_INFO.email}
                </a>
              </p>
              <p>
                <a
                  className="hover:text-[var(--evergreen)]"
                  href={STORE_INFO.zaloUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Zalo
                </a>
              </p>
            </address>
          </section>

          <div className="space-y-8">
            <FooterNav title="Mua sắm" items={SHOP_NAV} />
            <FooterNav title={COMPANY_NAV_LABEL} items={COMPANY_NAV} />
          </div>

          <FooterNav title={POLICY_NAV_LABEL} items={POLICY_NAV} />
        </div>
        <p className="mt-10 border-t pt-5 text-xs" style={{ borderColor: "var(--line)" }}>
          © {new Date().getFullYear()} {STORE_INFO.brand} Việt Nam
        </p>
      </div>
    </footer>
  );
}
