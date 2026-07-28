import type { PrismaClient } from "@/generated/prisma/client";
import {
  OrderStatus,
  PaymentDirection,
  type BankTransactionStatus as BankTransactionStatusValue,
  type OrderStatus as OrderStatusValue,
  type PaymentDirection as PaymentDirectionValue,
} from "@/generated/prisma/enums";
import {
  nextOrderStatuses,
} from "@/lib/order-status";
import {
  summarizePaymentLedger,
  type PaymentLedgerSummary,
} from "@/lib/payment-ledger";

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

export type AdminOrderDetail = {
  id: string;
  orderCode: string;
  email: string;
  customerName: string;
  phone: string;
  province: string;
  ward: string;
  addressLine: string;
  note: string | null;
  subtotal: number;
  shippingFee: number;
  total: number;
  status: OrderStatusValue;
  paidAt: Date | null;
  lastRefundAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    productName: string;
    size: string;
    color: string;
    unitPrice: number;
    quantity: number;
  }>;
  payments: Array<{
    id: string;
    provider: string;
    transactionId: string;
    amount: number;
    matchedAt: Date;
    direction: PaymentDirectionValue;
    externalReference: string | null;
    note: string | null;
    recordedBy: {
      name: string;
      email: string;
    } | null;
  }>;
  bankTransactions: Array<{
    id: string;
    provider: string;
    providerTransactionId: string;
    gateway: string;
    accountNumber: string;
    transferType: string;
    amount: number;
    paymentCode: string | null;
    content: string;
    referenceCode: string | null;
    occurredAt: Date;
    status: BankTransactionStatusValue;
    reviewReason: string | null;
    processedAt: Date | null;
  }>;
  ledgerSummary: PaymentLedgerSummary;
  nextOrderStatuses: OrderStatusValue[];
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

export async function getAdminOrderDetail(
  db: PrismaClient,
  orderId: string,
): Promise<AdminOrderDetail | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderCode: true,
      email: true,
      customerName: true,
      phone: true,
      province: true,
      ward: true,
      addressLine: true,
      note: true,
      subtotal: true,
      shippingFee: true,
      total: true,
      status: true,
      paidAt: true,
      lastRefundAt: true,
      createdAt: true,
      updatedAt: true,
      items: {
        select: {
          id: true,
          productName: true,
          size: true,
          color: true,
          unitPrice: true,
          quantity: true,
        },
      },
      payments: {
        orderBy: { matchedAt: "desc" },
        select: {
          id: true,
          provider: true,
          transactionId: true,
          amount: true,
          matchedAt: true,
          direction: true,
          externalReference: true,
          note: true,
          recordedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      bankTransactions: {
        orderBy: { occurredAt: "desc" },
        select: {
          id: true,
          provider: true,
          providerTransactionId: true,
          gateway: true,
          accountNumber: true,
          transferType: true,
          amount: true,
          paymentCode: true,
          content: true,
          referenceCode: true,
          occurredAt: true,
          status: true,
          reviewReason: true,
          processedAt: true,
        },
      },
    },
  });

  if (!order) return null;

  const ledgerSummary = summarizePaymentLedger(order.payments);
  const allowedTargets = nextOrderStatuses(order.status);
  const allowedWithoutRefundedFulfillment =
    order.status === OrderStatus.PAID && ledgerSummary.refundState === "FULL"
      ? allowedTargets.filter((status) => status !== OrderStatus.FULFILLED)
      : [...allowedTargets];

  return {
    ...order,
    ledgerSummary,
    nextOrderStatuses: allowedWithoutRefundedFulfillment,
  };
}
