import { EmptyState } from "@/components/empty-state";

export default function NotFoundPage() {
  return (
    <EmptyState
      title="Không tìm thấy trang"
      description="Trang bạn tìm kiếm không còn tồn tại hoặc đã được chuyển đi."
      action={{ href: "/", label: "Về trang chủ" }}
    />
  );
}
