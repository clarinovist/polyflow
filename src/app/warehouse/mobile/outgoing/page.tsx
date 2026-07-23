import { getDeliveryOrders } from "@/actions/inventory/deliveries";
import { serializeData } from "@/lib/utils/utils";
import { WarehouseOutgoingMobileClient } from "./WarehouseOutgoingMobileClient";

export default async function WarehouseMobileOutgoingPage() {
  const result = await getDeliveryOrders();
  const allOrders = result.success && result.data ? serializeData(result.data) : [];

  const openOrders = (
    allOrders as {
      id: string;
      orderNumber: string;
      status: string;
      deliveryDate: string;
      sourceLocation?: { name: string };
      salesOrder?: { customer?: { name: string } };
    }[]
  ).filter(
    (o) => o.status === "PENDING" || o.status === "LOADING",
  );

  // LOADING first, then PENDING
  openOrders.sort(
    (
      a: { status: string; deliveryDate: string },
      b: { status: string; deliveryDate: string },
    ) => {
      if (a.status === "LOADING" && b.status !== "LOADING") return -1;
      if (a.status !== "LOADING" && b.status === "LOADING") return 1;
      return (
        new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime()
      );
    },
  );

  return <WarehouseOutgoingMobileClient orders={openOrders} />;
}
