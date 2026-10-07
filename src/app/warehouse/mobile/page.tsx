import { getOpenDeliveryOrders } from '@/actions/inventory/deliveries';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { serializeData } from '@/lib/utils/utils';
import { WarehouseMobileHomeClient } from './WarehouseMobileHomeClient';
import { withTenantPage } from '@/lib/core/tenant';
import { getWarehouseTodayKPIs } from '@/actions/dashboard/warehouse-kpi';
import { getOpnameSessions } from '@/actions/inventory/opname';
import { MobileReadError } from '@/components/mobile';

const getData = withTenantPage(async () => {
    const [deliveryOrdersResult, receivablePOs, todayKPIs, opnameResult] =
        await Promise.all([
            getOpenDeliveryOrders(),
            PurchaseService.listReceivablePurchaseOrders(),
            getWarehouseTodayKPIs(),
            getOpnameSessions(),
        ]);

    if (!deliveryOrdersResult.success || !opnameResult.success) {
        return { success: false as const };
    }

    const allOrders = deliveryOrdersResult.data
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

    const sessions = opnameResult.data
        ? (serializeData(opnameResult.data) as { status: string }[])
        : [];
    const openOpnameCount = sessions.filter((s) => s.status === 'OPEN').length;

    return {
        success: true as const,
        data: {
        loadingCount: loadingOrders.length,
        pendingCount: pendingOrders.length,
        receivableCount: receivablePOs?.length ?? 0,
        openOpnameCount,
        shippedTodayCount: todayKPIs.shippedToday,
        receivedTodayCount: todayKPIs.receivedToday,
        recentLoading: loadingOrders.slice(0, 3),
        },
    };
});

export default async function WarehouseMobilePage() {
    const result = await getData();
    if (!result.success) {
        return <MobileReadError title="Ringkasan gudang belum tersedia" />;
    }
    return <WarehouseMobileHomeClient data={result.data} />;
}
