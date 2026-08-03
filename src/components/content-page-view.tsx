import type { ContentPage } from "@/lib/content-page";

/**
 * Khung hiển thị dùng chung cho mọi trang nội dung tĩnh: h1, đoạn mở đầu, rồi
 * lần lượt từng section (h2 + đoạn văn hoặc gạch đầu dòng).
 *
 * `children` được render ngay dưới đoạn mở đầu, TRƯỚC các section — dùng cho
 * phần đặc thù của một trang, ví dụ khối địa chỉ có link `tel:`/`mailto:` ở
 * trang Chi nhánh, thứ khách cần thấy trước cả phần diễn giải.
 */
export function ContentPageView({
  page,
  children,
}: {
  page: ContentPage;
  children?: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      {/* Dùng div, KHÔNG dùng <header>: trình duyệt phơi <header> thành landmark
          "banner", trang sẽ có hai banner cùng lúc với header của site. */}
      <div>
        <h1
          className="text-3xl font-bold tracking-tight sm:text-4xl"
          style={{ color: "var(--evergreen)" }}
        >
          {page.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-neutral-700">{page.lead}</p>
      </div>

      {children}

      <div className="mt-10 space-y-10">
        {page.sections.map((section) => (
          <section key={section.heading} data-testid="content-section">
            <h2 className="text-xl font-semibold text-neutral-900">{section.heading}</h2>

            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} className="mt-3 leading-relaxed text-neutral-700">
                {paragraph}
              </p>
            ))}

            {section.bullets ? (
              <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-neutral-700">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="marker:text-[color:var(--evergreen)]">
                    {bullet}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </article>
  );
}
