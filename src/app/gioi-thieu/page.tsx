import type { Metadata } from "next";
import { AboutCompanyImages } from "@/components/company/about-company-images";
import { ContentPageView } from "@/components/content-page-view";
import { GIOI_THIEU_PAGE } from "@/lib/company-content";

export const metadata: Metadata = {
  title: GIOI_THIEU_PAGE.title,
  description: GIOI_THIEU_PAGE.metaDescription,
};

export default function GioiThieuPage() {
  return (
    <ContentPageView page={GIOI_THIEU_PAGE}>
      <AboutCompanyImages />
    </ContentPageView>
  );
}
