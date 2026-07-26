import { getDeliveryOrders } from '@/actions/inventory/deliveries';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { serializeData } from '@/lib/utils/utils';
import { WarehouseMobileHomeClient } from './WarehouseMobileHomeClient';
import { withTenantPage } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';

const getData = withTenantPage(async () => {
    const [deliveryOrdersResult, receivablePOs] = await Promise.all([
        getDeliveryOrders(),
        PurchaseService.listReceivablePurchaseOrders(),
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

    const todayStr = toBusinessDateString(new Date());
    const { startOfDay, endOfDay } = getWibDayBounds(todayStr);

    const shippedTodayCount = (
        allOrders as { status: string; updatedAt?: string | Date }[]
    ).filter((o) => {
        if (o.status !== 'SHIPPED' && o.status !== 'DELIVERED') return false;
        if (!o.updatedAt) return false;
        const updatedMs = new Date(o.updatedAt).getTime();
        return (
            updatedMs >= startOfDay.getTime() && updatedMs <= endOfDay.getTime()
        );
    }).length;

    const receivedTodayCount = await prisma.purchaseOrder.count({
        where: {
            status: { in: ['RECEIVED', 'PARTIAL_RECEIVED'] },
            updatedAt: { gte: startOfDay, lte: endOfDay },
        },
    });

    return {
        loadingCount: loadingOrders.length,
        pendingCount: pendingOrders.length,
        receivableCount: receivablePOs?.length ?? 0,
        shippedTodayCount,
        receivedTodayCount,
        recentLoading: loadingOrders.slice(0, 3),
    };
});

export default async function WarehouseMobilePage() {
    const data = await getData();
    return <WarehouseMobileHomeClient data={data} />;
}
