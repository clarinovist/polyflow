/**
 * Shared status helpers for field sales pages.
 * Extracted here for testability and reuse across OrderListClient and OrderDetailClient.
 */

import { getSalesStatusLabel } from "@/lib/labels/status";

export const STATUS_OPTIONS = [
  { value: "ALL", label: "Semua" },
  { value: "PIPELINE", label: "Penawaran" },
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Berjalan" },
  { value: "DONE", label: "Selesai" },
  { value: "CANCELLED", label: "Ditolak/Batal" },
] as const;

export type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"];

/** Statuses that belong to each pipeline group */
const PIPELINE_STATUSES = ["QUOTATION", "QUOTATION_SENT"];
const ACTIVE_STATUSES = ["CONFIRMED", "IN_PRODUCTION", "READY_TO_SHIP", "SHIPPED"];
const DONE_STATUSES = ["DELIVERED"];

export function getMobileStatusColor(status: string): string {
  switch (status) {
    case "QUOTATION":
    case "QUOTATION_SENT":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "DRAFT":
      return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200";
    case "CONFIRMED":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    case "IN_PRODUCTION":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    case "READY_TO_SHIP":
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400";
    case "SHIPPED":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "DELIVERED":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "CANCELLED":
    case "QUOTATION_REJECTED":
    case "QUOTATION_EXPIRED":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-slate-100 text-slate-800";
  }
}

export function getMobileStatusLabel(status: string, orderType?: string): string {
  return getSalesStatusLabel(status, orderType);
}

export type MobileOrder = {
  id: string;
  orderNumber: string;
  orderDate: string;
  status: string;
  orderType?: string;
  totalAmount: number | null;
  customerName: string;
  itemCount: number;
};

export function filterOrders(
  orders: MobileOrder[],
  search: string,
  statusFilter: StatusFilter,
): MobileOrder[] {
  let result = orders;

  if (statusFilter === "PIPELINE") {
    result = result.filter((o) => PIPELINE_STATUSES.includes(o.status));
  } else if (statusFilter === "ACTIVE") {
    result = result.filter((o) => ACTIVE_STATUSES.includes(o.status));
  } else if (statusFilter === "DONE") {
    result = result.filter((o) => DONE_STATUSES.includes(o.status));
  } else if (statusFilter !== "ALL") {
    result = result.filter((o) => o.status === statusFilter);
  }

  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q),
    );
  }
  return result;
}

export function getMobileOrderActions(status: string): string[] {
  switch (status) {
    case "QUOTATION":
    case "QUOTATION_SENT":
      return ["accept", "reject", "cancel"];
    case "DRAFT":
      return ["confirm", "cancel"];
    case "CONFIRMED":
    case "READY_TO_SHIP":
      return ["ship", "cancel"];
    case "IN_PRODUCTION":
      return ["ready_to_ship"];
    case "SHIPPED":
      return ["deliver"];
    case "DELIVERED":
    case "CANCELLED":
    case "QUOTATION_REJECTED":
    case "QUOTATION_EXPIRED":
      return [];
    default:
      return [];
  }
}
