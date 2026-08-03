import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContentPageView } from "./content-page-view";
import type { ContentPage } from "@/lib/content-page";

const PAGE: ContentPage = {
  href: "/vi-du",
  navLabel: "Ví dụ",
  title: "Tiêu đề trang",
  metaDescription: "Mô tả trang ví dụ dùng cho test.",
  lead: "Đoạn mở đầu của trang ví dụ.",
  sections: [
    { heading: "Phần có đoạn văn", paragraphs: ["Câu thứ nhất.", "Câu thứ hai."] },
    { heading: "Phần có gạch đầu dòng", bullets: ["Điểm một", "Điểm hai"] },
  ],
};

describe("ContentPageView", () => {
  it("hiển thị h1, đoạn mở đầu và một h2 cho mỗi section", () => {
    render(<ContentPageView page={PAGE} />);

    expect(screen.getByRole("heading", { level: 1, name: "Tiêu đề trang" })).toBeInTheDocument();
    expect(screen.getByText("Đoạn mở đầu của trang ví dụ.")).toBeInTheDocument();

    const headings = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual(["Phần có đoạn văn", "Phần có gạch đầu dòng"]);
  });

  it("không tạo thêm landmark banner cạnh header của site", () => {
    const { container } = render(<ContentPageView page={PAGE} />);

    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(container.querySelector("header")).toBeNull();
  });

  it("render cả đoạn văn và danh sách gạch đầu dòng", () => {
    render(<ContentPageView page={PAGE} />);

    expect(screen.getByText("Câu thứ hai.")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((node) => node.textContent)).toEqual([
      "Điểm một",
      "Điểm hai",
    ]);
  });

  it("render phần bổ sung của riêng từng trang ngay trước các section", () => {
    const { container } = render(
      <ContentPageView page={PAGE}>
        <p>Khối liên hệ riêng</p>
      </ContentPageView>,
    );

    const extra = screen.getByText("Khối liên hệ riêng");
    const firstSection = screen.getAllByTestId("content-section")[0];

    expect(extra).toBeInTheDocument();
    expect(
      extra.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.querySelector("article")).toBeInTheDocument();
  });
});
