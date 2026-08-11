import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

const { default: ChinhSachPage, generateMetadata, generateStaticParams } = await import(
  "./page"
);

describe("ChinhSachPage", () => {
  it("render sẵn đúng năm trang chính sách lúc build", () => {
    expect(generateStaticParams()).toEqual([
      { slug: "huong-dan-mua-hang" },
      { slug: "giao-hang" },
      { slug: "thanh-toan" },
      { slug: "doi-tra" },
      { slug: "bao-mat" },
    ]);
  });

  it("hiển thị hướng dẫn mua hàng theo hành trình đặt hàng", async () => {
    render(
      await ChinhSachPage({ params: Promise.resolve({ slug: "huong-dan-mua-hang" }) }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Hướng dẫn mua hàng" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Các bước mua hàng" }),
    ).toBeInTheDocument();
  });

  it("công bố bảo hành 30 ngày cùng điều kiện đổi trả", async () => {
    render(await ChinhSachPage({ params: Promise.resolve({ slug: "doi-tra" }) }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Chính sách bảo hành và đổi trả" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Bảo hành lỗi sản xuất trong 30 ngày",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Hoàn tiền" })).toBeInTheDocument();
  });

  it("đặt title và description theo từng trang", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "bao-mat" }),
    });

    expect(metadata.title).toBe("Chính sách bảo mật thông tin");
    expect(metadata.description).toMatch(/thu thập/i);
  });

  it("trả 404 cho slug không tồn tại thay vì render trang rỗng", async () => {
    await expect(
      ChinhSachPage({ params: Promise.resolve({ slug: "khong-ton-tai" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("không trả metadata bịa cho slug không tồn tại", async () => {
    expect(
      await generateMetadata({ params: Promise.resolve({ slug: "khong-ton-tai" }) }),
    ).toEqual({});
  });
});
