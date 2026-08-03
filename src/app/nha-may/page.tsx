import type { Metadata } from "next";
import { ContentPageView } from "@/components/content-page-view";
import { NHA_MAY_PAGE } from "@/lib/company-content";

export const metadata: Metadata = {
  title: NHA_MAY_PAGE.title,
  description: NHA_MAY_PAGE.metaDescription,
};

export default function NhaMayPage() {
  return <ContentPageView page={NHA_MAY_PAGE} />;
}
