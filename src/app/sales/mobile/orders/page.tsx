import { getSalesOrders } from "@/actions/sales/sales";
import { OrderListClient } from "./OrderListClient";

export default async function SalesMobileOrdersPage() {
  const ordersRes = await getSalesOrders(false);
  const orders = ordersRes?.success && ordersRes.data ? ordersRes.data : [];

  const serialized = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    orderDate: String(o.orderDate),
    status: o.status,
    totalAmount: o.totalAmount ? Number(o.totalAmount) : null,
    customerName: o.customer?.name || "Internal",
    itemCount: o._count?.items ?? 0,
  }));

  return <OrderListClient orders={serialized} />;
}
