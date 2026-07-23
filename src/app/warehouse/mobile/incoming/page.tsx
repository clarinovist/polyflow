import { PurchaseService } from "@/services/purchasing/purchase-service";
import { serializeData } from "@/lib/utils/utils";
import { withTenantPage } from "@/lib/core/tenant";
import { WarehouseIncomingMobileClient } from "./WarehouseIncomingMobileClient";

const getData = withTenantPage(async () => {
  const [receivablePOs, todayReceipts] = await Promise.all([
    PurchaseService.listReceivablePurchaseOrders(),
    PurchaseService.getGoodsReceiptsForDay(new Date()),
  ]);
  return { receivablePOs, todayReceipts };
});

export default async function WarehouseMobileIncomingPage() {
  const data = await getData();

  return (
    <WarehouseIncomingMobileClient
      receivablePOs={serializeData(data.receivablePOs) as never}
      todayReceipts={serializeData(data.todayReceipts) as never}
    />
  );
}
