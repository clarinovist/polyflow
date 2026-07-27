import { getOpenDeliveryOrders } from '@/actions/inventory/deliveries';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { serializeData } from '@/lib/utils/utils';
import { WarehouseMobileHomeClient } from './WarehouseMobileHomeClient';
import { withTenantPage } from '@/lib/core/tenant';
import { getWarehouseTodayKPIs } from '@/actions/dashboard/warehouse-kpi';

const getData = withTenantPage(async () => {
    const [deliveryOrdersResult, receivablePOs, todayKPIs] =
        await Promise.all([
            getOpenDeliveryOrders(),
            PurchaseService.listReceivablePurchaseOrders(),
            getWarehouseTodayKPIs(),
        ]);

    const allOrders =
        deliveryOrdersResult.success && deliveryOrdersResult.data
            ? serializeData(deliveryOrdersResult.data)
            : [];

    const openOrders = (
        allOrders as {
            status: string;
            id: string;
            orderNumber: string;
            deliveryDate: string;
            salesOrder?: { customer?: { name: string } };
        }[]
    ).filter((o) => o.status === 'PENDING' || o.status === 'LOADING');

    const loadingOrders = openOrders.filter((o) => o.status === 'LOADING');
    const pendingOrders = openOrders.filter((o) => o.status === 'PENDING');

    return {
        loadingCount: loadingOrders.length,
        pendingCount: pendingOrders.length,
        receivableCount: receivablePOs?.length ?? 0,
        shippedTodayCount: todayKPIs.shippedToday,
        receivedTodayCount: todayKPIs.receivedToday,
        recentLoading: loadingOrders.slice(0, 3),
    };
});

export default async function WarehouseMobilePage() {
    const data = await getData();
    return <WarehouseMobileHomeClient data={data} />;
}
