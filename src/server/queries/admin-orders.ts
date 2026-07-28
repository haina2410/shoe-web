import type { PrismaClient } from "@/generated/prisma/client";
import {
  OrderStatus,
  PaymentDirection,
  type PaymentDirection as PaymentDirectionValue,
} from "@/generated/prisma/enums";

export type AdminOrderFilters = {
  status?: OrderStatus;
  refund: "all" | "with";
  query: string;
};

export type AdminOrderListItem = {
  id: string;
  orderCode: string;
  customerName: string;
  createdAt: Date;
  total: number;
  status: OrderStatus;
  payments: Array<{
    direction: PaymentDirectionValue;
    amount: number;
  }>;
};

const ORDER_STATUSES = new Set<string>(Object.values(OrderStatus));

export function parseAdminOrderFilters(input: {
  status?: string | string[];
  refund?: string | string[];
  query?: string | string[];
}): AdminOrderFilters {
  const status =
    typeof input.status === "string" && ORDER_STATUSES.has(input.status)
      ? (input.status as OrderStatus)
      : undefined;
  const refund = input.refund === "with" ? "with" : "all";
  const query =
    typeof input.query === "string"
      ? input.query.trim().toUpperCase().slice(0, 32)
      : "";

  return { status, refund, query };
}

export async function listAdminOrders(
  db: PrismaClient,
  filters: AdminOrderFilters,
): Promise<AdminOrderListItem[]> {
  return db.order.findMany({
    where: {
      status: filters.status,
      orderCode: filters.query
        ? { contains: filters.query, mode: "insensitive" }
        : undefined,
      payments:
        filters.refund === "with"
          ? { some: { direction: PaymentDirection.OUT } }
          : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      orderCode: true,
      customerName: true,
      createdAt: true,
      total: true,
      status: true,
      payments: {
        select: {
          direction: true,
          amount: true,
        },
      },
    },
  });
}
