/**
 * Shared status helpers for mobile sales pages.
 * Extracted here for testability and reuse across OrderListClient and OrderDetailClient.
 */

export const STATUS_OPTIONS = [
  { value: "ALL", label: "Semua" },
  { value: "DRAFT", label: "Draft" },
  { value: "CONFIRMED", label: "Dikonfirmasi" },
  { value: "IN_PRODUCTION", label: "Produksi" },
  { value: "READY_TO_SHIP", label: "Siap Kirim" },
  { value: "SHIPPED", label: "Dikirim" },
  { value: "DELIVERED", label: "Terkirim" },
  { value: "CANCELLED", label: "Batal" },
] as const;

export type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"];

export function getMobileStatusColor(status: string): string {
  switch (status) {
    case "DRAFT":
      return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200";
    case "CONFIRMED":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "IN_PRODUCTION":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    case "READY_TO_SHIP":
      return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400";
    case "SHIPPED":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
    case "DELIVERED":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "CANCELLED":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-slate-100 text-slate-800";
  }
}

export function getMobileStatusLabel(status: string): string {
  const opt = STATUS_OPTIONS.find((o) => o.value === status);
  return opt?.label || status;
}

export type MobileOrder = {
  id: string;
  orderNumber: string;
  orderDate: string;
  status: string;
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
  if (statusFilter !== "ALL") {
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
      return [];
    default:
      return [];
  }
}
