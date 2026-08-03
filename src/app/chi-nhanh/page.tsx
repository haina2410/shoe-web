import type { Metadata } from "next";
import { ContentPageView } from "@/components/content-page-view";
import { CHI_NHANH_PAGE, MAP_URL, WORKING_HOURS } from "@/lib/company-content";
import { STORE_INFO } from "@/lib/storefront-content";

export const metadata: Metadata = {
  title: CHI_NHANH_PAGE.title,
  description: CHI_NHANH_PAGE.metaDescription,
};

/**
 * `/chi-nhanh` — hiện chỉ có một địa điểm, nên trang này là một thẻ địa chỉ đầy
 * đủ (gọi, gửi thư, Zalo, mở bản đồ) thay vì một danh sách chi nhánh.
 */
export default function ChiNhanhPage() {
  return (
    <ContentPageView page={CHI_NHANH_PAGE}>
      <section
        aria-labelledby="tru-so"
        className="mt-8 rounded-xl border p-5 sm:p-6"
        style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)" }}
      >
        <h2 id="tru-so" className="text-xl font-semibold text-neutral-900">
          Trụ sở &amp; xưởng sản xuất
        </h2>

        <dl className="mt-4 space-y-3 text-neutral-700">
          <div>
            <dt className="font-medium text-neutral-900">Địa chỉ</dt>
            <dd>
              <address className="not-italic">{STORE_INFO.address}</address>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-900">Giờ làm việc</dt>
            <dd>{WORKING_HOURS}</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-900">Điện thoại</dt>
            <dd>
              <a
                className="inline-flex min-h-11 items-center hover:text-[var(--evergreen)]"
                href={`tel:${STORE_INFO.phoneDigits}`}
              >
                {STORE_INFO.phoneDisplay}
              </a>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-900">Email</dt>
            <dd>
              <a
                className="inline-flex min-h-11 items-center hover:text-[var(--evergreen)]"
                href={`mailto:${STORE_INFO.email}`}
              >
                {STORE_INFO.email}
              </a>
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-3">
          <a
            className="inline-flex min-h-11 items-center rounded-md px-4 font-medium"
            href={MAP_URL}
            rel="noreferrer"
            style={{ backgroundColor: "var(--evergreen)", color: "var(--paper)" }}
            target="_blank"
          >
            Mở trên bản đồ
          </a>
          <a
            className="inline-flex min-h-11 items-center rounded-md border px-4 font-medium"
            href={STORE_INFO.zaloUrl}
            rel="noreferrer"
            style={{ borderColor: "var(--line)" }}
            target="_blank"
          >
            Nhắn Zalo
          </a>
        </div>
      </section>
    </ContentPageView>
  );
}
