import { getOpenDeliveryOrders } from '@/actions/inventory/deliveries';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { serializeData } from '@/lib/utils/utils';
import { WarehouseMobileHomeClient } from './WarehouseMobileHomeClient';
import { withTenantPage } from '@/lib/core/tenant';
import { getWarehouseTodayKPIs } from '@/actions/dashboard/warehouse-kpi';
import { getOpnameSessions } from '@/actions/inventory/opname';

const getData = withTenantPage(async () => {
    const [deliveryOrdersResult, receivablePOs, todayKPIs, opnameResult] =
        await Promise.all([
            getOpenDeliveryOrders(),
            PurchaseService.listReceivablePurchaseOrders(),
            getWarehouseTodayKPIs(),
            getOpnameSessions(),
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

    const sessions =
        opnameResult.success && opnameResult.data
            ? (serializeData(opnameResult.data) as { status: string }[])
            : [];
    const openOpnameCount = sessions.filter((s) => s.status === 'OPEN').length;

    return {
        loadingCount: loadingOrders.length,
        pendingCount: pendingOrders.length,
        receivableCount: receivablePOs?.length ?? 0,
        openOpnameCount,
        shippedTodayCount: todayKPIs.shippedToday,
        receivedTodayCount: todayKPIs.receivedToday,
        recentLoading: loadingOrders.slice(0, 3),
    };
});

export default async function WarehouseMobilePage() {
    const data = await getData();
    return <WarehouseMobileHomeClient data={data} />;
}
