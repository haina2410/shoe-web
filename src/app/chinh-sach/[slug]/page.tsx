import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentPageView } from "@/components/content-page-view";
import { POLICY_PAGES, POLICY_SLUGS, type PolicySlug } from "@/lib/policy-content";

/**
 * `/chinh-sach/[slug]` — bốn trang chính sách dùng chung một route vì cấu trúc
 * hoàn toàn giống nhau (tiêu đề + đoạn mở đầu + các section).
 *
 * Theo `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`
 * (Next 16): `params` là một Promise, phải `await`. `generateStaticParams` khai
 * báo đúng bốn slug nên bốn trang này được render sẵn lúc build; slug lạ dẫn tới
 * `notFound()`.
 */

type Params = { slug: string };

function findPolicy(slug: string) {
  return (POLICY_SLUGS as readonly string[]).includes(slug)
    ? POLICY_PAGES[slug as PolicySlug]
    : null;
}

export function generateStaticParams(): Params[] {
  return POLICY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = findPolicy(slug);
  if (!page) return {};

  return { title: page.title, description: page.metaDescription };
}

export default async function ChinhSachPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const page = findPolicy(slug);

  if (!page) {
    notFound();
  }

  return <ContentPageView page={page} />;
}
