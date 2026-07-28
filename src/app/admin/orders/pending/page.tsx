import { redirect } from "next/navigation";

export default function AdminPendingOrdersPage() {
  redirect("/admin/orders?status=PENDING_PAYMENT");
}
