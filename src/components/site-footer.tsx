import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { STORE_INFO } from "@/lib/storefront-content";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t" style={{ borderColor: "var(--line)" }}>
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-neutral-600">
        <div className="grid gap-8 md:grid-cols-3">
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

          <nav aria-label="Điều hướng chân trang">
            <h2 className="font-semibold text-neutral-900">Mua sắm</h2>
            <ul className="mt-3 space-y-2">
              <li>
                <Link className="hover:text-[var(--evergreen)]" href="/products">
                  Sản phẩm
                </Link>
              </li>
              <li>
                <Link className="hover:text-[var(--evergreen)]" href="/cart">
                  Giỏ hàng
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <p className="mt-10 border-t pt-5 text-xs" style={{ borderColor: "var(--line)" }}>
          © {new Date().getFullYear()} {STORE_INFO.brand} Việt Nam
        </p>
      </div>
    </footer>
  );
}
