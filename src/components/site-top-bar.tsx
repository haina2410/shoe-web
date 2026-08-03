import { STORE_INFO } from "@/lib/storefront-content";

/**
 * Thanh liên hệ trên cùng: địa chỉ, điện thoại và email của cửa hàng.
 *
 * Mục đích là để khách gọi hoặc gửi thư ngay từ bất kỳ trang nào mà không phải
 * cuộn xuống chân trang. Điện thoại và email là link `tel:`/`mailto:` nên bấm
 * trên mobile là gọi/soạn thư được luôn. Địa chỉ dài nên chỉ hiện từ `sm` trở
 * lên, tránh chiếm hai dòng trên điện thoại.
 */
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
            href={`mailto:${STORE_INFO.email}`}
          >
            {STORE_INFO.email}
          </a>
        </div>
      </div>
    </div>
  );
}
